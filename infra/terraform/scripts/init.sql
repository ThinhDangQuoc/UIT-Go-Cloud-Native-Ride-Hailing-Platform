CREATE DATABASE user_db;
CREATE DATABASE driver_db;
CREATE DATABASE trip_db;

\c user_db
-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,                     -- Khóa chính, tự tăng
    email VARCHAR(255) UNIQUE NOT NULL,        -- Email duy nhất, bắt buộc nhập
    password_hash VARCHAR(255) NOT NULL,       -- Mật khẩu sau khi hash
    role VARCHAR(50) NOT NULL,                 -- Vai trò: 'driver' hoặc 'passenger'
    personal_info JSONB,                       -- Lưu thông tin cá nhân dạng JSON (cho linh hoạt)
    vehicle_info JSONB,                        -- Lưu thông tin xe của tài xế (nếu có)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Thời điểm tạo bản ghi
  );
  
\c driver_db
CREATE TABLE IF NOT EXISTS driver_location_history (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE INDEX IF NOT EXISTS idx_history_driver_time 
      ON driver_location_history(driver_id, created_at DESC);

\c trip_db
-- 3. Trips Table
CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,                       -- Khóa chính, tự động tăng
    passenger_id INTEGER NOT NULL,               -- ID hành khách (bắt buộc)
    driver_id INTEGER,                           -- ID tài xế (có thể null khi chưa gán)
    pickup VARCHAR(255) NOT NULL,                -- Điểm đón
    destination VARCHAR(255) NOT NULL,           -- Điểm đến
    fare NUMERIC(10,2) NOT NULL,                 -- Giá cước, kiểu số thập phân (VD: 120000.00)
    status VARCHAR(50) DEFAULT 'searching',      -- Trạng thái chuyến đi (searching / accepted / completed / canceled)
    rating INTEGER CHECK (rating BETWEEN 1 AND 5), -- Đánh giá (1–5 sao), có thể null nếu chưa đánh giá
    comment TEXT,                                -- Nhận xét của hành khách (tuỳ chọn)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Thời gian tạo bản ghi
  );
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(50) NOT NULL, -- Vd: 'TRIP'
    aggregate_id VARCHAR(50) NOT NULL,   -- Vd: Trip ID
    event_type VARCHAR(50) NOT NULL,     -- Vd: 'TRIP_CREATED'
    payload JSONB NOT NULL,              -- Nội dung message gửi SQS
    status VARCHAR(20) DEFAULT 'PENDING',-- PENDING, PROCESSED, FAILED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );