import pg from "pg"; 
import dotenv from "dotenv"; 
dotenv.config(); // Kích hoạt dotenv, giúp process.env có dữ liệu từ .env

const { Pool } = pg; // Lấy lớp Pool từ thư viện pg, dùng để tạo connection pool

// =============================================================================
// READ/WRITE SPLIT CONFIGURATION (RDS Read Replicas Pattern)
// =============================================================================

// WRITE POOL → Points to RDS Master (for INSERT, UPDATE, DELETE)
const writePool = new Pool({
  host: process.env.POSTGRES_WRITE_HOST || "trip-db", 
  user: process.env.POSTGRES_USER,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT,
  max: 20, // Giới hạn connection cho write
  ssl: false
});

// READ POOL → Points to RDS Read Replica (for SELECT)
const readPool = new pg.Pool({
  host: process.env.POSTGRES_READ_HOST || "trip-db",
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  max: 100, // Nhiều connection hơn cho read-heavy workloads
  ssl: false
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