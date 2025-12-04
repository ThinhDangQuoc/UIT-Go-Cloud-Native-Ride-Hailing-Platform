import pg from "pg"; 
import dotenv from "dotenv"; 
dotenv.config(); // Kích hoạt dotenv, giúp process.env có dữ liệu từ .env

const { Pool } = pg; // Lấy lớp Pool từ thư viện pg, dùng để tạo connection pool

// Kiểm tra môi trường: Nếu là 'production' (trên ECS) thì bắt buộc dùng SSL
const dbHost = process.env.POSTGRES_WRITE_HOST || process.env.POSTGRES_HOST || "trip-db";
const isRDS = dbHost.includes("amazonaws.com");
const isProduction = process.env.ENV === "production";

const sslConfig = (isProduction || isRDS)
  ? { rejectUnauthorized: false } // Chấp nhận chứng chỉ RDS (Self-signed/AWS CA)
  : false;                        // Tắt SSL khi chạy Local (Docker Compose)

console.log(`🔌 [TripService DB] Host: ${dbHost} | SSL: ${!!sslConfig}`);

const poolConfig = {
  host: dbHost,
  port: process.env.POSTGRES_PORT || dbHost,
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "password",
  database: process.env.POSTGRES_DB || "trip_db",
  max: 20,
  ssl: sslConfig, 
};

// =============================================================================
// READ/WRITE SPLIT CONFIGURATION (RDS Read Replicas Pattern)
// =============================================================================

// WRITE POOL → Points to RDS Master (for INSERT, UPDATE, DELETE)
const writePool = new Pool({
  ...poolConfig,
  host: process.env.POSTGRES_WRITE_HOST || dbHost,
});

// READ POOL → Points to RDS Read Replica (for SELECT)
const readPool = new pg.Pool({
  ...poolConfig,
  host: process.env.POSTGRES_READ_HOST || poolConfig.host,
  max: 100, // Nhiều connection hơn cho read-heavy workloads
});

// Log connection info on startup
console.log(`📝 [DB] Write Pool → ${process.env.POSTGRES_WRITE_HOST || 'trip-db'}`);
console.log(`📖 [DB] Read Pool  → ${process.env.POSTGRES_READ_HOST || 'trip-db'}`);

export const db = {
  // Default query (uses Write Pool for safety)
  query: (text, params) => writePool.query(text, params),
  
  // Explicit WRITE → RDS Master
  write: async (text, params) => {
    //console.log(`📝 [WRITE] → Master: ${text.substring(0, 50)}...`);
    return writePool.query(text, params);
  },
  
  // Explicit READ → RDS Replica
  read: async (text, params) => {
    //console.log(`📖 [READ] → Replica: ${text.substring(0, 50)}...`);
    return readPool.query(text, params);
  },
  
  // Transaction Client (must use Write Pool)
  getTransactionClient: () => writePool.connect(),
};

export default db;