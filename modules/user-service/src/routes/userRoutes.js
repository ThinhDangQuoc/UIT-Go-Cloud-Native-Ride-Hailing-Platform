// Import Express để tạo router
import express from "express";

// Import các controller xử lý logic nghiệp vụ
import { register, login, getProfile } from "../controllers/userController.js";

// Import middleware xác thực JWT
import { authMiddleware } from "../middleware/authMiddleware.js";

// Tạo một router riêng cho user
const router = express.Router();

//Routes
// Đăng ký tài khoản mới
// POST /users
// Body: { email, password, role, personalInfo?, vehicleInfo? }
router.post("/users", register);

// Đăng nhập để lấy JWT token
// POST /sessions
// Body: { email, password }
// Trả về: { token, user }
router.post("/sessions", login);

// Lấy thông tin người dùng hiện tại (yêu cầu có JWT token)
// GET /users/me
// Header: Authorization: Bearer <token>
router.get("/users/me", authMiddleware, getProfile);

// Export router để import vào app chính
export default router;
