import pool from "../db/db.js"; // Kết nối Postgres
import redis, { KEYS } from "../utils/redis.js";

const BATCH_SIZE = 500; // Số lượng bản ghi mỗi lần ghi (Batch size)
const FLUSH_INTERVAL = 3000; // Thời gian chờ tối đa (ms) nếu chưa đủ batch

export async function startLocationBatchWorker() {
  console.log("💾 [BatchWorker] Started location history writer...");

  while (true) {
    try {
      // 1. Lấy dữ liệu từ Redis Buffer
      // lpop(key, count) lấy ra tối đa BATCH_SIZE phần tử và xóa khỏi list
      // Lưu ý: Cần redis client hỗ trợ lpop có count (Redis v6.2+).
      // Nếu dùng bản Redis cũ hoặc thư viện cũ, dùng lrange + ltrim.
      const logs = await redis.lpop(KEYS.LOCATION_BUFFER, BATCH_SIZE);

      // Nếu không có dữ liệu, nghỉ một chút để không spam CPU
      if (!logs || logs.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, FLUSH_INTERVAL));
        continue;
      }

      // 2. Chuẩn bị dữ liệu để Bulk Insert
      const values = [];
      const placeholders = [];
      let paramIndex = 1;

      logs.forEach((log) => {
        // Parse chuỗi "driverId|lat|lng|timestamp"
        const [driverId, lat, lng, timestamp] = log.split("|");
        
        if (driverId && lat && lng) {
          values.push(driverId, parseFloat(lat), parseFloat(lng), new Date(parseInt(timestamp)));
          
          // Tạo placeholder ($1, $2, $3, $4), ($5, $6, $7, $8)...
          placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
          paramIndex += 4;
        }
      });

      if (values.length === 0) continue;

      // 3. Thực hiện Bulk Insert vào PostgreSQL
      const query = `
        INSERT INTO driver_location_history (driver_id, latitude, longitude, created_at)
        VALUES ${placeholders.join(", ")}
      `;

      await pool.query(query, values);

      console.log(`💾 [BatchWorker] Flushed ${logs.length} location records to DB.`);

    } catch (err) {
      console.error("❌ [BatchWorker] Error:", err);
      // Nếu lỗi DB, dữ liệu đã bị LPOP khỏi Redis sẽ mất (Trade-off).
      // Để khắc phục, cần cơ chế 'Reliable Queue' phức tạp hơn (RPOPLPUSH).
      // Với data vị trí, mất vài điểm thường chấp nhận được để đổi lấy tốc độ.
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}