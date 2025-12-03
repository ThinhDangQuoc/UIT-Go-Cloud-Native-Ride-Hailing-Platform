import json
import boto3
import psycopg2
from psycopg2.extras import execute_values
import os
from datetime import datetime

"""
Lambda Function: Location History Batch Writer
Consumes location events from SQS and batch inserts into PostgreSQL

Configuration Environment Variables:
- DB_HOST: PostgreSQL host
- DB_PORT: PostgreSQL port (default: 5432)
- DB_NAME: Database name
- DB_USER: Database username
- DB_PASSWORD: Database password
"""

# Database connection pool
db_connection = None

def get_db_connection():
    """Get or create database connection with connection pooling"""
    global db_connection
    
    if db_connection is None or db_connection.closed:
        db_connection = psycopg2.connect(
            host=os.environ.get('DB_HOST'),
            port=os.environ.get('DB_PORT', '5432'),
            dbname=os.environ.get('DB_NAME'),
            user=os.environ.get('DB_USER'),
            password=os.environ.get('DB_PASSWORD'),
            connect_timeout=5
        )
        db_connection.autocommit = False
    
    return db_connection

def handler(event, context):
    """
    Lambda handler for batch processing location updates
    
    Expected SQS message format:
    {
        "type": "driver.location_history",
        "driverId": "123",
        "lat": 10.762622,
        "lng": 106.660172,
        "heading": 45,
        "speed": 30,
        "accuracy": 10,
        "tripId": "456",
        "recordedAt": "2025-11-28T10:30:00.000Z"
    }
    """
    
    print(f"Processing {len(event['Records'])} records")
    
    locations = []
    failed_records = []
    
    # Parse all records
    for record in event['Records']:
        try:
            body = json.loads(record['body'])
            
            # Validate required fields
            if not all(key in body for key in ['driverId', 'lat', 'lng']):
                print(f"Missing required fields in record: {record['messageId']}")
                continue
            
            # Parse timestamp
            recorded_at = body.get('recordedAt')
            if recorded_at:
                recorded_at = datetime.fromisoformat(recorded_at.replace('Z', '+00:00'))
            else:
                recorded_at = datetime.utcnow()
            
            locations.append((
                int(body['driverId']),
                float(body['lat']),
                float(body['lng']),
                body.get('heading'),
                body.get('speed'),
                body.get('accuracy'),
                body.get('tripId'),
                recorded_at
            ))
            
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            print(f"Failed to parse record {record['messageId']}: {str(e)}")
            failed_records.append({
                'itemIdentifier': record['messageId']
            })
    
    if not locations:
        print("No valid locations to insert")
        return {
            'statusCode': 200,
            'body': json.dumps({'inserted': 0, 'failed': len(failed_records)})
        }
    
    # Batch insert into PostgreSQL
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        insert_query = """
            INSERT INTO driver_location_history 
            (driver_id, lat, lng, heading, speed, accuracy, trip_id, recorded_at)
            VALUES %s
            ON CONFLICT DO NOTHING
        """
        
        execute_values(
            cursor,
            insert_query,
            locations,
            template="(%s, %s, %s, %s, %s, %s, %s, %s)"
        )
        
        inserted_count = cursor.rowcount
        conn.commit()
        
        print(f"Successfully inserted {inserted_count} location records")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'inserted': inserted_count,
                'failed': len(failed_records)
            }),
            # Return failed records for SQS partial batch failure
            'batchItemFailures': failed_records
        }
        
    except psycopg2.Error as e:
        print(f"Database error: {str(e)}")
        
        # Rollback on error
        if db_connection:
            db_connection.rollback()
        
        # Return all as failed for retry
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)}),
            'batchItemFailures': [
                {'itemIdentifier': record['messageId']} 
                for record in event['Records']
            ]
        }
    
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise

def create_partition_if_needed(cursor, recorded_at):
    """
    Create monthly partition if it doesn't exist
    Called periodically or on first insert of the month
    """
    year = recorded_at.year
    month = recorded_at.month
    
    partition_name = f"driver_location_history_{year}_{month:02d}"
    
    # Check if partition exists
    cursor.execute("""
        SELECT EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE tablename = %s
        )
    """, (partition_name,))
    
    if not cursor.fetchone()[0]:
        # Calculate next month
        if month == 12:
            next_year = year + 1
            next_month = 1
        else:
            next_year = year
            next_month = month + 1
        
        create_sql = f"""
            CREATE TABLE IF NOT EXISTS {partition_name}
            PARTITION OF driver_location_history
            FOR VALUES FROM ('{year}-{month:02d}-01') 
            TO ('{next_year}-{next_month:02d}-01')
        """
        
        cursor.execute(create_sql)
        print(f"Created partition: {partition_name}")
