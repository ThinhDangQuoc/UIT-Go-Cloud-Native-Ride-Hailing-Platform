import { createTripWithOutbox, createTrip, getTripById, updateTripStatus, assignDriver, updateTripReview } from "../models/tripModel.js";
import { TRIP_STATUS } from "../utils/constants.js";
import { pushTripOfferJob } from "../utils/tripSqs.js";

// Hàm tạo chuyến đi mới
export async function createTripHandler(req, res) {
  try {
    const { pickup, destination, pickupLat, pickupLng } = req.body;

    // 1. Validation cơ bản
    if (!pickup || !destination) {
      return res.status(400).json({ message: "Pickup and destination are required" });
    }

    // 2. Lấy User ID (Passenger ID)
    // Ưu tiên lấy từ Header (x-user-id) do API Gateway hoặc Auth Middleware truyền vào
    // Fallback: lấy từ body nếu test nhanh (nhưng production nên dùng header/token)
    const passengerId = req.headers["x-user-id"] || req.user?.id;

    if (!passengerId) {
      return res.status(400).json({ message: "Missing passengerId (check headers 'x-user-id')" });
    }

    // 5. Gọi Model: Truyền THAM SỐ RỜI (Positional Arguments) thay vì Object
    // Thứ tự: (passengerId, pickup, destination, fare, status, driverId)
    const trip = await createTripWithOutbox({
      passengerId: passengerId,
      pickup, destination, pickupLat, pickupLng,
      fare: 50000,
      status: TRIP_STATUS.SEARCHING
    });
    
    // 6. Đẩy tin nhắn lên SQS để thông báo tài xế (bên trong hàm này có xử lý lỗi)
    await pushTripOfferJob({
      tripId: trip.id,
      pickup: trip.pickup,
      destination: trip.destination,
      fare: trip.fare,
      passengerId: trip.passenger_id, 
      pickupLat: pickupLat, 
      pickupLng: pickupLng
    });

    console.log("✅ [TripService] Job pushed successfully");

    // 7. Trả về kết quả cho Client
    return res.status(201).json({
      message: "Trip created and offer sent",
      tripId: trip.id,
      status: trip.status
    });

  } catch (err) {
    console.error("❌ [TripService] Create Trip Error:", err);
    return res.status(500).json({ 
      message: "Internal server error", 
      error: err.message 
    });
  }
}

// Lấy thông tin chuyến đi theo ID
export async function getTripHandler(req, res) {
  try {
    const { id } = req.params;
    const trip = await getTripById(id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    res.json(trip);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// Hủy chuyến đi
export async function cancelTripHandler(req, res) {
  try {
    const { id } = req.params;
    const userId = req.headers["x-user-id"] || req.user?.id;
    const trip = await getTripById(id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (userId && String(trip.passenger_id) !== String(userId)) {
      console.log(`❌ [Cancel Trip] Unauthorized: User ${userId} tried to cancel trip of ${trip.passenger_id}`);
      return res.status(403).json({ message: "You are not authorized to cancel this trip" });
    }

    // Không cho phép hủy nếu chuyến đi đã hoàn thành
    if (trip.status === TRIP_STATUS.COMPLETED)
      return res.status(400).json({ message: "Trip already completed" });

    // Cập nhật trạng thái chuyến đi sang CANCELED
    const updated = await updateTripStatus(id, TRIP_STATUS.CANCELED);
    res.json({ message: "Trip canceled", trip: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// Đánh dấu chuyến đi đã hoàn thành
export async function completeTripHandler(req, res) {
  // 1. Lấy ID người yêu cầu (Driver) từ Header hoặc Middleware
  const requesterId = req.headers["x-user-id"] || req.user?.id;
  try {
    const { id } = req.params;
    const trip = await getTripById(id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    // 3. CHECK QUYỀN: Chỉ tài xế được gán cho chuyến này mới được hoàn thành
    // (Dùng String() để so sánh an toàn giữa số và chuỗi)
    if (!requesterId || String(trip.driver_id) !== String(requesterId)) {
      console.log(`❌ [Complete Debug] Unauthorized! Driver '${trip.driver_id}' expected, but got '${requesterId}'`);
      return res.status(403).json({ 
        message: "You are not authorized to complete this trip",
        debug: `Trip belongs to driver ${trip.driver_id}` 
      });
    }

    // Chỉ có thể hoàn thành nếu chuyến đi đang được chấp nhận hoặc đang diễn ra
    if (trip.status !== TRIP_STATUS.ACCEPTED && trip.status !== TRIP_STATUS.IN_PROGRESS)
      return res.status(400).json({ message: "Trip not active" });

    // Cập nhật trạng thái sang COMPLETED
    const updated = await updateTripStatus(id, TRIP_STATUS.COMPLETED);
    res.json({ message: "Trip completed", trip: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// Gửi đánh giá cho chuyến đi
export async function reviewTripHandler(req, res) {
  try {
    const { id } = req.params; // ID của chuyến đi
    const { rating, comment } = req.body;
    
    // 1. Lấy ID an toàn: Ưu tiên lấy từ Header (do Gateway gửi) -> sau đó mới tới req.user
    const passengerId = req.headers["x-user-id"] || req.user?.id;

    console.log("-------------------------------------------------");
    console.log(`🔍 [Review Debug] Incoming Review for TripID: ${id}`);
    console.log(`🔍 [Review Debug] PassengerID from Request: '${passengerId}' (Type: ${typeof passengerId})`);

    // Kiểm tra điểm đánh giá hợp lệ
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const trip = await getTripById(id);
    
    if (!trip) {
      console.log("❌ [Review Debug] Trip not found in DB");
      return res.status(404).json({ message: "Trip not found" });
    }

    console.log(`🔍 [Review Debug] DB Trip Info: Status='${trip.status}', PassengerID='${trip.passenger_id}' (Type: ${typeof trip.passenger_id})`);

    // Chỉ được đánh giá khi chuyến đi đã hoàn thành
    // (Kiểm tra cả viết hoa viết thường cho chắc chắn)
    if (trip.status !== "completed" && trip.status !== "COMPLETED") {
      console.log(`❌ [Review Debug] Invalid Status: ${trip.status}`);
      return res.status(400).json({ message: "Trip must be completed to review" });
    }

    // 2. SO SÁNH AN TOÀN: Ép kiểu cả 2 về String trước khi so sánh
    // Để tránh lỗi: 10 (number) !== "10" (string)
    const isMatch = String(trip.passenger_id) === String(passengerId);

    if (!isMatch) {
      console.log(`❌ [Review Debug] 403 Forbidden. Mismatch: DB '${trip.passenger_id}' vs Req '${passengerId}'`);
      return res.status(403).json({ 
        message: "You are not allowed to review this trip",
        debug: `Expected passenger ${trip.passenger_id}, but got ${passengerId}`
      });
    }

    // Cập nhật đánh giá vào cơ sở dữ liệu
    const updated = await updateTripReview(trip.id, rating, comment || "");
    
    console.log("✅ [Review Debug] Review submitted successfully");
    res.status(201).json({ message: "Review submitted", trip: updated });

  } catch (err) {
    console.error("❌ [Review Debug] Error:", err);
    res.status(500).json({ message: err.message });
  }
}

// Lấy danh sách đánh giá theo ID tài xế
export async function getReviewsByDriverHandler(req, res) {
  try {
    const { driverId } = req.params;
    const reviews = await getReviewsByDriver(driverId);

    if (!reviews.length)
      return res.status(404).json({ message: "No reviews found for this driver" });

    res.json({ driverId, total: reviews.length, reviews });
  } catch (err) {
    console.error("getReviewsByDriverHandler error:", err);
    res.status(500).json({ message: err.message });
  }
}

// Tài xế chấp nhận chuyến đi
export async function acceptTripHandler(req, res) {
  const { tripId } = req.params;
  const { driverId } = req.body;

  try {
    const trip = await getTripById(tripId);
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    // Chỉ có thể chấp nhận nếu chuyến đi đang ở trạng thái SEARCHING
    if (trip.status !== TRIP_STATUS.SEARCHING)
      return res.status(400).json({ message: "Trip already accepted or canceled" });

    // Gán tài xế cho chuyến đi và cập nhật trạng thái
    const updated = await assignDriver(tripId, driverId);
    await updateTripStatus(tripId, TRIP_STATUS.ACCEPTED);

    res.json({ message: "Driver accepted trip", trip: updated });
  } catch (err) {
    console.error("acceptTripHandler error:", err);
    res.status(500).json({ message: err.message });
  }
}

// Tài xế từ chối chuyến đi
export async function rejectTripHandler(req, res) {
  const { tripId } = req.params;
  const { driverId } = req.body;

  try {
    const trip = await getTripById(tripId);
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    // Chỉ có thể từ chối nếu chuyến đi đang trong trạng thái tìm tài xế
    if (trip.status !== TRIP_STATUS.SEARCHING)
      return res.status(400).json({ message: "Trip already processed" });

    // Ghi log khi tài xế từ chối
    console.log(`Driver ${driverId} rejected trip ${tripId}`);
    res.json({ message: "Driver rejected trip" });
  } catch (err) {
    console.error("rejectTripHandler error:", err);
    res.status(500).json({ message: err.message });
  }
}
