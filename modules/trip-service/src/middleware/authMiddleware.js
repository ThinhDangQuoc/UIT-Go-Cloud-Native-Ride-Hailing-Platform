import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET;

export function authMiddleware(req, res, next) {
  // Nếu request từ GateWay → trust
  if (req.headers["x-user-id"]) {
    req.user = {
      id: req.headers["x-user-id"],
      role: req.headers["x-user-role"],
      email: req.headers["x-user-email"]
    };
    return next();
  }

  // Nếu gọi trực tiếp service → verify token
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: "Missing token" });

  const token = header.split(" ")[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ message: "Invalid token" });
  }
}
