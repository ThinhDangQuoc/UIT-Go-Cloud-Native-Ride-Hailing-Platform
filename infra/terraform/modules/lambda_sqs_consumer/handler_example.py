# Create a simple example Lambda function zip file for SQS consumer
def handler(event, context):
    import json
    
    for record in event['Records']:
        # Parse SQS message
        body = json.loads(record['body'])
        
        print(f"Processing message: {json.dumps(body)}")
        
        # Add your processing logic here
        # Example: call user-service, driver-service, or trip-service
        
    return {
        'statusCode': 200,
        'body': json.dumps('Messages processed successfully')
    }
