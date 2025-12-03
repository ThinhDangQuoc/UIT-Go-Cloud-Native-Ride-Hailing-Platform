import pg from "pg"; 
import dotenv from "dotenv"; 
dotenv.config(); // Kích hoạt dotenv, giúp process.env có dữ liệu từ .env

const { Pool } = pg; // Lấy lớp Pool từ thư viện pg, dùng để tạo connection pool

// Cấu hình pool kết nối đến cơ sở dữ liệu PostgreSQL
const pool = new Pool({
  user: process.env.POSTGRES_USER,       // Tên người dùng DB
  host: process.env.POSTGRES_HOST,       // Địa chỉ host 
  database: process.env.POSTGRES_DB,     // Tên cơ sở dữ liệu
  password: process.env.POSTGRES_PASSWORD, // Mật khẩu của user
  port: process.env.POSTGRES_PORT,       // Cổng PostgreSQL 
  ssl: false
});

// Xuất pool để có thể sử dụng ở các module khác
export default pool;
