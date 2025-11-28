import { db } from "../db/db.js";

// Hàm tạo chuyến đi mới
export async function createTrip(passengerId, pickup, destination, fare, status, driverId = null) {
  // Thực thi câu lệnh SQL để thêm bản ghi mới vào bảng trips
  const res = await db.query(
    `INSERT INTO trips (passenger_id, pickup, destination, fare, status, driver_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`, // Trả về bản ghi vừa được tạo
    [passengerId, pickup, destination, fare, status, driverId]
  );
  // Trả về đối tượng chuyến đi mới tạo
  return res.rows[0];
}

// Hàm lấy thông tin chuyến đi theo ID
export async function getTripById(id) {
  // Truy vấn 1 bản ghi trong bảng trips theo id
  const res = await db.query("SELECT * FROM trips WHERE id = $1", [id]);
  // Trả về chuyến đi (hoặc undefined nếu không tồn tại)
  return res.rows[0];
}

// Hàm cập nhật trạng thái chuyến đi
export async function updateTripStatus(id, status) {
  // Cập nhật cột status của chuyến đi có id tương ứng
  const res = await db.query(
    "UPDATE trips SET status = $1 WHERE id = $2 RETURNING *",
    [status, id]
  );
  // Trả về bản ghi đã cập nhật
  return res.rows[0];
}

// Hàm gán tài xế cho chuyến đi
export async function assignDriver(tripId, driverId) {
  // Cập nhật driver_id và chuyển trạng thái sang 'accepted'
  const res = await db.query(
    "UPDATE trips SET driver_id = $1, status = 'accepted' WHERE id = $2 RETURNING *",
    [driverId, tripId]
  );
  // Trả về bản ghi đã được cập nhật
  return res.rows[0];
}

// Hàm cập nhật đánh giá (rating, comment) cho chuyến đi
export async function updateTripReview(tripId, rating, comment) {
  // Cập nhật điểm đánh giá và bình luận
  const res = await db.query(
    `UPDATE trips
     SET rating = $1, comment = $2
     WHERE id = $3
     RETURNING *`,
    [rating, comment, tripId]
  );
  // Trả về bản ghi sau khi được cập nhật
  return res.rows[0];
}

export async function createTripWithOutbox(tripData) {
  // 1. Debug: Log dữ liệu nhận được từ Controller
  console.log("🛠 [Model] createTripWithOutbox received:", tripData);

  // 2. Destructuring: Đảm bảo tên biến ở đây KHỚP với tên key gửi từ Controller
  // Lưu ý: passengerId (camelCase) phải khớp với controller
  const { passengerId, pickup, destination, fare, status, pickupLat, pickupLng } = tripData;
  
  // Validation cấp Model (Chặn lỗi trước khi gọi DB)
  if (!passengerId) {
    throw new Error("❌ [Model] passengerId is missing or null!");
  }

  const client = await db.getTransactionClient();
  
  try {
    await client.query("BEGIN"); 

    // 3. Query: Chú ý thứ tự biến trong mảng values []
    const tripRes = await client.query(
      `INSERT INTO trips (passenger_id, pickup, destination, fare, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [passengerId, pickup, destination, fare, status] 
      // $1 -> passengerId
      // $2 -> pickup
      // $3 -> destination ...
    );
    const trip = tripRes.rows[0];

    const payload = {
      tripId: trip.id,
      pickup, destination, fare, passengerId, pickupLat, pickupLng
    };

    await client.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      ['TRIP', trip.id, 'TRIP_OFFER', JSON.stringify(payload)]
    );

    await client.query("COMMIT"); 
    return trip;

  } catch (err) {
    await client.query("ROLLBACK");
    // Log lỗi chi tiết
    console.error("❌ [Model] Transaction Failed. Data:", { passengerId, pickup });
    throw err;
  } finally {
    client.release();
  }
}