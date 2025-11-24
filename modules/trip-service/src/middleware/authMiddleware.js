import jwt from 'jsonwebtoken'; 
// Import thư viện jsonwebtoken để xác thực và giải mã token JWT

const JWT_SECRET = process.env.JWT_SECRET; // Lấy secret key từ biến môi trường, phải trùng với UserService

export function authMiddleware(req, res, next) {
  // Middleware xác thực người dùng thông qua JWT token
  const authHeader = req.headers.authorization; 
  // Lấy header Authorization từ request (thường có dạng "Bearer <token>")

  if (!authHeader) {
    // Nếu không có header Authorization, từ chối truy cập
    return res.status(401).json({ message: 'Missing token' });
  }

  const token = authHeader.split(' ')[1]; 
  // Cắt chuỗi để lấy phần token (bỏ chữ "Bearer")

  if (!token) {
    // Nếu không có token sau khi tách, trả về lỗi định dạng token
    return res.status(401).json({ message: 'Invalid token format' });
  }

  try {
    // Giải mã và xác thực token bằng secret key
    const decoded = jwt.verify(token, JWT_SECRET);

    // Lưu thông tin người dùng (id, email, role) vào req.user để các route khác có thể sử dụng
    req.user = decoded;

    // Cho phép request đi tiếp đến controller tiếp theo
    next();
  } catch (err) {
    // Nếu token không hợp lệ hoặc đã hết hạn, trả về mã 403 (Forbidden)
    res.status(403).json({ message: 'Invalid token' });
  }
}
