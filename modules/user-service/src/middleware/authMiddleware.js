// Import thư viện JWT để giải mã và xác thực token
import jwt from "jsonwebtoken";

// Lấy secret key từ biến môi trường (phải giống key khi tạo token)
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware xác thực người dùng bằng JWT
export function authMiddleware(req, res, next) {
  // Lấy header Authorization từ request
  // Thông thường có dạng: "Authorization: Bearer <token>"
  const header = req.headers.authorization;

  // Nếu không có header → chưa gửi token
  if (!header) return res.status(401).json({ message: "Missing token" });

  // Tách token ra khỏi chuỗi "Bearer ..."
  const token = header.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Invalid token format" });

  try {
    // Giải mã và xác thực token bằng secret key
    const decoded = jwt.verify(token, JWT_SECRET);

    // Lưu thông tin người dùng vào req.user để các route khác có thể dùng
    // decoded thường chứa { id, email, role }
    req.user = decoded;

    // Gọi next() để chuyển sang middleware hoặc route tiếp theo
    next();
  } catch (err) {
    // Nếu verify thất bại (token sai, hết hạn, v.v.)
    res.status(401).json({ message: "Invalid token" });
  }
}
