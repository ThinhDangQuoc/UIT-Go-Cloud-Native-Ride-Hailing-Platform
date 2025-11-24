import pool from "../db/db.js"; 

// Hàm tạo chuyến đi mới
export async function createTrip(passengerId, pickup, destination, fare, status, driverId = null) {
  // Thực thi câu lệnh SQL để thêm bản ghi mới vào bảng trips
  const res = await pool.query(
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
  const res = await pool.query("SELECT * FROM trips WHERE id = $1", [id]);
  // Trả về chuyến đi (hoặc undefined nếu không tồn tại)
  return res.rows[0];
}

// Hàm cập nhật trạng thái chuyến đi
export async function updateTripStatus(id, status) {
  // Cập nhật cột status của chuyến đi có id tương ứng
  const res = await pool.query(
    "UPDATE trips SET status = $1 WHERE id = $2 RETURNING *",
    [status, id]
  );
  // Trả về bản ghi đã cập nhật
  return res.rows[0];
}

// Hàm gán tài xế cho chuyến đi
export async function assignDriver(tripId, driverId) {
  // Cập nhật driver_id và chuyển trạng thái sang 'accepted'
  const res = await pool.query(
    "UPDATE trips SET driver_id = $1, status = 'accepted' WHERE id = $2 RETURNING *",
    [driverId, tripId]
  );
  // Trả về bản ghi đã được cập nhật
  return res.rows[0];
}

// Hàm cập nhật đánh giá (rating, comment) cho chuyến đi
export async function updateTripReview(tripId, rating, comment) {
  // Cập nhật điểm đánh giá và bình luận
  const res = await pool.query(
    `UPDATE trips
     SET rating = $1, comment = $2
     WHERE id = $3
     RETURNING *`,
    [rating, comment, tripId]
  );
  // Trả về bản ghi sau khi được cập nhật
  return res.rows[0];
}
