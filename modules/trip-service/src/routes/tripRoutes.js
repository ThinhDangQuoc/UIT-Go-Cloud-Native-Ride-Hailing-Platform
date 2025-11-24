import express from "express";
// Import các hàm điều khiển (controller) để xử lý logic từng loại yêu cầu (request)
import {
  createTripHandler,
  getTripHandler,
  cancelTripHandler,
  completeTripHandler,
  reviewTripHandler,
  acceptTripHandler,
  rejectTripHandler
} from "../controllers/tripController.js";

// Import middleware xác thực người dùng qua JWT
import { authMiddleware } from "../middleware/authMiddleware.js";

// Tạo router của Express để định nghĩa các endpoint cho trip-service
const router = express.Router();

// Tạo chuyến đi mới (chỉ cho phép người dùng đã đăng nhập)
router.post("/trips", authMiddleware, createTripHandler);

// Lấy thông tin chi tiết một chuyến đi theo ID (yêu cầu xác thực)
router.get("/trips/:id", authMiddleware, getTripHandler);

// Hủy chuyến đi (người dùng hoặc tài xế có thể gọi, cần xác thực)
router.post("/trips/:id/cancel", authMiddleware, cancelTripHandler);

// Hoàn thành chuyến đi (thường do tài xế gọi, cần xác thực)
router.post("/trips/:id/complete", authMiddleware, completeTripHandler);

// Gửi đánh giá cho chuyến đi (chỉ cho phép hành khách đã hoàn tất chuyến)
router.post("/trips/:id/review", authMiddleware, reviewTripHandler);

// Tài xế chấp nhận chuyến đi (không yêu cầu authMiddleware ở đây, nhưng có thể bổ sung sau)
router.post("/trips/:tripId/accept", acceptTripHandler);

// Tài xế từ chối chuyến đi
router.post("/trips/:tripId/reject", rejectTripHandler);

// Xuất router để sử dụng trong app chính (server.js)
export default router;
