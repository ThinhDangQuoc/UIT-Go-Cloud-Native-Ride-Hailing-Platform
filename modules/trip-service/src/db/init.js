import pool from "./db.js"; 
// Import kết nối cơ sở dữ liệu PostgreSQL được cấu hình sẵn từ file db.js

export async function initDB() {
  // Hàm khởi tạo bảng trips nếu chưa tồn tại
  const query = `
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
  `;

  // Thực thi câu lệnh SQL trên database
  await pool.query(query);

  // Log ra console để xác nhận đã khởi tạo bảng thành công
  console.log("[trip-service] trips table ready");
}
