// Import các thư viện cần thiết
import express from "express";  // Framework web cho Node.js
import cors from "cors";        // Cho phép API truy cập từ domain khác (Cross-Origin)
import userRoutes from "./routes/userRoutes.js"; // Import các route của user service
import { initDB } from "./db/init.js";           // Hàm khởi tạo bảng trong DB

// Khởi tạo ứng dụng Express
const app = express();

// Cho phép CORS để client (frontend) có thể gọi API từ domain khác
app.use(cors());

// Cho phép Express tự động parse JSON trong request body
app.use(express.json());

app.get('/', (req, res) => res.status(200).send('OK'));
app.get('/health', (req, res) => res.status(200).send('OK'));

// Đăng ký route cho API — mọi endpoint sẽ bắt đầu bằng /api
app.use("/api", userRoutes);

app.use((req, res, next) => {
  console.log(`[UserService] ${req.method} ${req.url} - body:`, req.body);
  next();
});

// ====================== SERVER CONFIG ======================

// Lấy port từ biến môi trường, mặc định 4000 nếu không có
const PORT = process.env.PORT || 4000;

// Khởi động server
app.listen(PORT, () => {
  // Khi server khởi động, thực hiện initDB để đảm bảo bảng đã tồn tại
  initDB()
    .then(() => console.log("✅ Database ready"))       // In log khi DB sẵn sàng
    .catch((err) => console.error("❌ DB init failed:", err)); // Báo lỗi nếu DB gặp vấn đề

  // In ra console port đang chạy
  console.log(`UserService running on port ${PORT}`);
});
