import pg from "pg"; 
import dotenv from "dotenv"; 
dotenv.config(); // Kích hoạt dotenv, giúp process.env có dữ liệu từ .env

const { Pool } = pg; // Lấy lớp Pool từ thư viện pg, dùng để tạo connection pool

// Cấu hình pool kết nối đến cơ sở dữ liệu PostgreSQL
const writePool = new Pool({
  host: process.env.POSTGRES_WRITE_HOST || "trip-db", 
  user: process.env.POSTGRES_USER,       // Tên người dùng DB
  database: process.env.POSTGRES_DB,     // Tên cơ sở dữ liệu
  password: process.env.POSTGRES_PASSWORD, // Mật khẩu của user
  port: process.env.POSTGRES_PORT,       // Cổng PostgreSQL 
  max: 20, // Giới hạn số connection tối đa cho write pool
  ssl: false
});

const readPool = new pg.Pool({
  host: process.env.POSTGRES_READ_HOST || "trip-db", // Trỏ tới Replica
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_NAME,
  max: 100, // Cho phép nhiều connection hơn để phục vụ đọc
  ssl: false
});

export const db = {
  // Hàm query mặc định (dùng Write Pool cho an toàn hoặc Read tuỳ context)
  query: (text, params) => writePool.query(text, params),
  
  // Explicit Write
  write: (text, params) => writePool.query(text, params),
  
  // Explicit Read
  read: (text, params) => readPool.query(text, params),
  
  // Lấy client để chạy Transaction (bắt buộc dùng Write Pool)
  getTransactionClient: () => writePool.connect(),
};

export default db;