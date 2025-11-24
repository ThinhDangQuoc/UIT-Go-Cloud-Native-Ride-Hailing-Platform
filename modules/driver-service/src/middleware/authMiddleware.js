import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET; // Khóa bí mật JWT, phải trùng với khóa ở UserService

// Middleware xác thực người dùng qua JWT
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  // Kiểm tra xem header Authorization có tồn tại không
  if (!authHeader) {
    return res.status(401).json({ message: 'Missing token' });
  }

  // Token thường có dạng "Bearer <token>", nên tách phần sau khoảng trắng
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Invalid token format' });
  }

  try {
    // Giải mã token để lấy thông tin người dùng (id, email, role)
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next(); // Chuyển sang middleware hoặc handler tiếp theo
  } catch (err) {
    // Nếu token không hợp lệ hoặc hết hạn, trả lỗi 403
    res.status(403).json({ message: 'Invalid token' });
  }
}
