import pg from "pg"; 
import dotenv from "dotenv"; 
dotenv.config(); // Kích hoạt dotenv, giúp process.env có dữ liệu từ .env

const { Pool } = pg; // Lấy lớp Pool từ thư viện pg, dùng để tạo connection pool

const dbHost = process.env.POSTGRES_HOST || "driver-db";
const isRDS = dbHost.includes("amazonaws.com");
const isProduction = process.env.NODE_ENV === "production";

const sslConfig = (isProduction || isRDS)
  ? { rejectUnauthorized: false } 
  : false;

console.log(`🔌 [DriverService DB] Host: ${dbHost} | SSL: ${!!sslConfig}`);

// Cấu hình pool kết nối đến cơ sở dữ liệu PostgreSQL
const pool = new Pool({
  user: process.env.POSTGRES_USER || "postgres",
  host: dbHost,
  database: process.env.POSTGRES_DB || "driver_db",
  password: process.env.POSTGRES_PASSWORD || "123456",
  port: process.env.POSTGRES_PORT || 5432,
  max: 20,
  ssl: sslConfig,
});

// Xuất pool để có thể sử dụng ở các module khác
export default pool;
