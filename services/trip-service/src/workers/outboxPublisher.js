import { db } from "../db/db.js";
import { pushTripOfferJob } from "../utils/tripSqs.js"; // Hàm gửi SQS cũ

export async function startOutboxWorker() {
  console.log("🚀 [OutboxWorker] Started polling outbox table...");
  
  setInterval(async () => {
    try {
      // 1. Quét các event chưa xử lý (Batch 50)
      const { rows } = await db.write(
        `SELECT * FROM outbox_events WHERE status = 'PENDING' LIMIT 50 FOR UPDATE SKIP LOCKED`
      );

      if (rows.length === 0) return;

      // 2. Xử lý từng event
      for (const event of rows) {
        try {
          const payload = event.payload; // Postgres tự parse JSONB
          
          if (event.event_type === 'TRIP_OFFER') {
            // Gọi hàm gửi SQS (Idempotent)
            await pushTripOfferJob(payload);
          }

          // 3. Xóa event sau khi gửi thành công (Hoặc update status = PROCESSED)
          await db.write(`DELETE FROM outbox_events WHERE id = $1`, [event.id]);
          console.log(`✅ [OutboxWorker] Processed event ${event.id}`);
          
        } catch (sendErr) {
          console.error(`❌ [OutboxWorker] Failed to send event ${event.id}`, sendErr);
          // Tăng biến retry_count trong DB nếu muốn retry strategy phức tạp hơn
        }
      }
    } catch (err) {
      console.error("❌ [OutboxWorker] Polling error", err);
    }
  }, 2000); // Poll mỗi 2 giây
}