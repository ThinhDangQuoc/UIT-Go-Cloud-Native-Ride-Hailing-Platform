// Import pool (kết nối tới PostgreSQL) từ file cấu hình
import pool from "./db.js";

// Hàm khởi tạo cơ sở dữ liệu (tạo bảng nếu chưa có)
export async function initDB() {
  // Câu lệnh SQL tạo bảng users
  const query = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,                     -- Khóa chính, tự tăng
    email VARCHAR(255) UNIQUE NOT NULL,        -- Email duy nhất, bắt buộc nhập
    password_hash VARCHAR(255) NOT NULL,       -- Mật khẩu sau khi hash
    role VARCHAR(50) NOT NULL,                 -- Vai trò: 'driver' hoặc 'passenger'
    personal_info JSONB,                       -- Lưu thông tin cá nhân dạng JSON (cho linh hoạt)
    vehicle_info JSONB,                        -- Lưu thông tin xe của tài xế (nếu có)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Thời điểm tạo bản ghi
  );
  `;

  // Thực thi truy vấn SQL
  await pool.query(query);

  // In log ra console để xác nhận đã khởi tạo xong bảng
  console.log("[user-service] users table ready");
}
