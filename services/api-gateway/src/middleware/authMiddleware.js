import jwt from "jsonwebtoken";

export function gatewayAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: "Missing token" });

  const token = header.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Invalid token format" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Gắn vào req để Gateway dùng
    req.user = decoded;

    // Forward user info sang service nội bộ
    req.headers["x-user-id"] = decoded.id;
    req.headers["x-user-role"] = decoded.role;
    req.headers["x-user-email"] = decoded.email;

    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid token" });
  }
}
