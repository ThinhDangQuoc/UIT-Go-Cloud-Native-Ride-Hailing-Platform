-- =====================================================
-- DRIVER LOCATION HISTORY - PostgreSQL Schema
-- Partitioned table for high-volume location storage
-- =====================================================

-- Enable TimescaleDB extension if available (optional, for advanced time-series features)
-- CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create parent table with RANGE partitioning by recorded_at
CREATE TABLE IF NOT EXISTS driver_location_history (
    id BIGSERIAL,
    driver_id INTEGER NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    heading SMALLINT CHECK (heading >= 0 AND heading <= 360),
    speed SMALLINT CHECK (speed >= 0),
    accuracy SMALLINT CHECK (accuracy >= 0),
    trip_id INTEGER,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Create index for trip-based queries (replay trip route)
CREATE INDEX IF NOT EXISTS idx_location_history_trip 
    ON driver_location_history (trip_id, recorded_at)
    WHERE trip_id IS NOT NULL;

-- Create index for driver history queries
CREATE INDEX IF NOT EXISTS idx_location_history_driver 
    ON driver_location_history (driver_id, recorded_at DESC);

-- Create index for time-range queries
CREATE INDEX IF NOT EXISTS idx_location_history_time 
    ON driver_location_history (recorded_at DESC);

-- =====================================================
-- MONTHLY PARTITIONS
-- Create partitions for the next 3 months
-- =====================================================

CREATE TABLE IF NOT EXISTS driver_location_history_2025_11
    PARTITION OF driver_location_history
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE IF NOT EXISTS driver_location_history_2025_12
    PARTITION OF driver_location_history
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS driver_location_history_2026_01
    PARTITION OF driver_location_history
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to automatically create new partitions
CREATE OR REPLACE FUNCTION create_location_partition()
RETURNS void AS $$
DECLARE
    partition_date DATE;
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    -- Create partition for next month
    partition_date := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
    partition_name := 'driver_location_history_' || TO_CHAR(partition_date, 'YYYY_MM');
    start_date := partition_date;
    end_date := partition_date + INTERVAL '1 month';
    
    -- Check if partition exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = partition_name
    ) THEN
        EXECUTE FORMAT(
            'CREATE TABLE %I PARTITION OF driver_location_history 
             FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
        RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to drop old partitions (data retention)
CREATE OR REPLACE FUNCTION drop_old_location_partitions(retention_months INTEGER DEFAULT 3)
RETURNS void AS $$
DECLARE
    partition_record RECORD;
    cutoff_date DATE;
BEGIN
    cutoff_date := DATE_TRUNC('month', NOW() - (retention_months || ' months')::INTERVAL);
    
    FOR partition_record IN
        SELECT tablename 
        FROM pg_tables 
        WHERE tablename LIKE 'driver_location_history_%'
        AND tablename ~ '^driver_location_history_\d{4}_\d{2}$'
    LOOP
        -- Extract date from partition name
        IF TO_DATE(
            SUBSTRING(partition_record.tablename FROM 'driver_location_history_(\d{4}_\d{2})'), 
            'YYYY_MM'
        ) < cutoff_date THEN
            EXECUTE FORMAT('DROP TABLE %I', partition_record.tablename);
            RAISE NOTICE 'Dropped old partition: %', partition_record.tablename;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MATERIALIZED VIEW for Analytics (optional)
-- =====================================================

-- Hourly aggregation for driver activity analysis
CREATE MATERIALIZED VIEW IF NOT EXISTS driver_location_hourly_stats AS
SELECT 
    driver_id,
    DATE_TRUNC('hour', recorded_at) AS hour,
    COUNT(*) AS location_count,
    AVG(speed) AS avg_speed,
    MAX(speed) AS max_speed,
    COUNT(DISTINCT trip_id) AS trip_count
FROM driver_location_history
WHERE recorded_at > NOW() - INTERVAL '7 days'
GROUP BY driver_id, DATE_TRUNC('hour', recorded_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_location_hourly_stats 
    ON driver_location_hourly_stats (driver_id, hour);

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE driver_location_history IS 
    'Stores historical driver location data with time-based partitioning for efficient querying and data retention';

COMMENT ON COLUMN driver_location_history.heading IS 
    'Direction of travel in degrees (0-360, where 0 is North)';

COMMENT ON COLUMN driver_location_history.speed IS 
    'Speed in km/h at the time of recording';

COMMENT ON COLUMN driver_location_history.accuracy IS 
    'GPS accuracy in meters';
