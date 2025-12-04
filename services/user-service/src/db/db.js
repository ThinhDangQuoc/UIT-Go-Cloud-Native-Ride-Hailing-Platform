import pg from "pg"; // Thư viện PostgreSQL chính thức cho Node.js
import dotenv from "dotenv"; // Dùng để đọc biến môi trường từ file .env
dotenv.config(); // Kích hoạt dotenv, giúp process.env có dữ liệu từ .env

const { Pool } = pg; // Lấy lớp Pool từ thư viện pg, dùng để tạo connection pool

const dbHost = process.env.POSTGRES_HOST || "user-db";
const isRDS = dbHost.includes("amazonaws.com");
const isProduction = process.env.NODE_ENV === "production";

const sslConfig = (isProduction || isRDS)
  ? { rejectUnauthorized: false } 
  : false;

console.log(`🔌 [UserService DB] Host: ${dbHost} | SSL: ${!!sslConfig}`);

// Cấu hình pool kết nối đến cơ sở dữ liệu PostgreSQL
const pool = new Pool({
  user: process.env.POSTGRES_USER || "postgres",
  host: dbHost,
  database: process.env.POSTGRES_DB || "user_db", // DB riêng cho user
  password: process.env.POSTGRES_PASSWORD || "123456",
  port: process.env.POSTGRES_PORT || 5432,
  max: 20,
  ssl: sslConfig,
});

// Export pool để các file khác có thể dùng để query DB
export default pool;
