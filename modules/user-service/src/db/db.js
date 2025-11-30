import pg from "pg"; // Thư viện PostgreSQL chính thức cho Node.js
import dotenv from "dotenv"; // Dùng để đọc biến môi trường từ file .env
dotenv.config(); // Kích hoạt dotenv, giúp process.env có dữ liệu từ .env

const { Pool } = pg; // Lấy lớp Pool từ thư viện pg, dùng để tạo connection pool

// Cấu hình pool kết nối đến cơ sở dữ liệu PostgreSQL
const pool = new Pool({
  user: process.env.POSTGRES_USER,      // Tên người dùng trong PostgreSQL
  host: process.env.POSTGRES_HOST,      // Địa chỉ host (VD: localhost hoặc container name)
  database: process.env.POSTGRES_DB,    // Tên cơ sở dữ liệu
  password: process.env.POSTGRES_PASSWORD, // Mật khẩu người dùng
  port: process.env.POSTGRES_PORT,      // Cổng PostgreSQL (mặc định là 5432)
  ssl: false,                           // Không dùng SSL trong môi trường local
});

// Export pool để các file khác có thể dùng để query DB
export default pool;
