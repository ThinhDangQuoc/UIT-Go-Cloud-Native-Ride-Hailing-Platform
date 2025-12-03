import pool from "./db.js"; 
// Import kết nối cơ sở dữ liệu PostgreSQL được cấu hình sẵn từ file db.js

export async function initDB() {
  // Hàm khởi tạo bảng trips nếu chưa tồn tại
  try {
    console.log("⏳ [InitDB] Checking database tables...");

    // 1. Tạo bảng history (Nếu chưa có)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS driver_location_history (
        id SERIAL PRIMARY KEY,
        driver_id INTEGER NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Tạo Index (Thêm IF NOT EXISTS để không lỗi nếu chạy lại)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_history_driver_time 
      ON driver_location_history(driver_id, created_at DESC)
    `);

    console.log("✅ [InitDB] Database initialized successfully.");
  } catch (err) {
    // Nếu lỗi là "Already exists" (42P07) thì coi như thành công, bỏ qua
    if (err.code === '42P07') {
      console.log("⚠️ [InitDB] Index already exists, skipping...");
    } else {
      console.error("❌ [InitDB] Initialization failed:", err);
      process.exit(1); // Dừng app nếu lỗi nghiêm trọng
    }
  }
}
