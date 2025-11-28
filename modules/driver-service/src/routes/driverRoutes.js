import express from "express";
import * as driverController from "../controllers/driverController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Cập nhật và truy xuất vị trí tài xế (hỗ trợ single và batch update)
router.put("/drivers/:id/location", authMiddleware, driverController.updateLocation);
router.get("/drivers/:id/location", authMiddleware, driverController.getLocation);

// Tìm tài xế gần vị trí chỉ định (với metadata đầy đủ)
router.get("/drivers/search", authMiddleware, driverController.searchNearbyDrivers);

// Gửi thông báo chuyến đi mới đến tài xế
router.post("/drivers/:id/notify", authMiddleware, driverController.notifyDriver);

// Tài xế chấp nhận hoặc từ chối chuyến đi
router.post("/drivers/:id/trips/:tripId/accept", authMiddleware, driverController.acceptTrip);
router.post("/drivers/:id/trips/:tripId/reject", authMiddleware, driverController.rejectTrip);

// Cập nhật trạng thái hoạt động của tài xế (online/offline/on_trip)
router.put("/drivers/:id/status", authMiddleware, driverController.updateStatus);

// Monitoring endpoint - Location service statistics
router.get("/drivers/stats/location", driverController.getLocationStats);

export default router;
