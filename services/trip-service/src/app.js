import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import tripRoutes from "./routes/tripRoutes.js";
import { initDB } from "./db/init.js";
import { initSqs } from "./utils/sqsClient.js";
import { startOutboxWorker } from "./workers/outboxPublisher.js";

dotenv.config();

const app = express();

// Cho phép ứng dụng nhận yêu cầu từ các domain khác (hỗ trợ frontend)
app.use(cors());

// Cho phép Express tự động parse dữ liệu JSON trong body request
app.use(express.json());

// Đăng ký các route của module Trip (các endpoint bắt đầu bằng /api)
app.use("/api", tripRoutes);

// Lấy cổng từ biến môi trường, mặc định 8083 nếu chưa được cấu hình
const PORT = process.env.PORT || 8083;

// Khởi động server và đảm bảo rằng bảng "trips" trong cơ sở dữ liệu đã sẵn sàng
app.listen(PORT, async () => {
    await initDB(); // Tạo bảng nếu chưa tồn tại
    await initSqs(); // đảm bảo queue tồn tại
    console.log(`🚕TripService running on port ${PORT}`);
    startOutboxWorker();
});
