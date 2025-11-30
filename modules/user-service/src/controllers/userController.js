// Import các thư viện cần thiết
import bcrypt from "bcryptjs"; // Dùng để mã hóa (hash) mật khẩu
import jwt from "jsonwebtoken"; // Dùng để tạo và xác thực token JWT
import redis from "../utils/redis.js";
import { createUser, findUserByEmail, findUserById } from "../models/userModel.js"; // Các hàm thao tác với cơ sở dữ liệu người dùng

const CACHE_TTL = 3600;
const JWT_SECRET = process.env.JWT_SECRET;

// Helper: Key chuẩn cho Redis
const getCacheKey = (userId) => `user:profile:${userId}`;

// Register function
export async function register(req, res) {
  try {
    // Lấy dữ liệu từ body của request
    const { email, password, role, personalInfo, vehicleInfo } = req.body;

    // Kiểm tra các trường bắt buộc
    if (!email || !password || !role) {
      return res.status(400).json({ message: "Email, password and role are required" });
    }

    // Kiểm tra xem email đã tồn tại chưa
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ message: "Email already used" });
    }

    // Nếu người dùng là driver, bắt buộc phải có thông tin cá nhân và xe
    if (role === 'driver' && (!personalInfo || !vehicleInfo)) {
      return res.status(400).json({ message: "Drivers must provide personal and vehicle info" });
    }

    // Xác nhận role hợp lệ (chỉ có 'passenger' hoặc 'driver')
    const validRoles = ["passenger", "driver"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // Mã hóa mật khẩu trước khi lưu vào cơ sở dữ liệu
    const hash = await bcrypt.hash(password, 10);

    // Tạo người dùng mới trong DB
    const user = await createUser(email, hash, role, personalInfo, vehicleInfo);

    // Trả về thông tin người dùng (không trả về password)
    res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      personal_info: user.personal_info,
      vehicle_info: user.vehicle_info
    });
  } catch (err) {
    // Ghi log lỗi và trả về mã lỗi 500
    console.error("Register error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Login function
export async function login(req, res) {
  try {
    // Lấy email và mật khẩu từ request body
    const { email, password } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    // Tìm người dùng theo email
    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    // So sánh mật khẩu người dùng nhập với mật khẩu đã hash trong DB
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    // Tạo JWT token chứa id, email, role của người dùng
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role || 'unknown'},
      JWT_SECRET,
      { expiresIn: "1d" } // Token hết hạn sau 1 ngày
    );

    // Trả về token và thông tin người dùng
    res.json({
      token,
      user: { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        personal_info: user.personal_info,
        vehicle_info: user.vehicle_info 
      },
    });
  } catch (err) {
    // Ghi log lỗi và phản hồi lỗi máy chủ
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Get profile function
export async function getProfile(req, res) {
  try {
    // Lấy userId từ đối tượng req.user (được middleware JWT gắn vào)
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const cacheKey = getCacheKey(userId);

    // 1️⃣ CACHE HIT: Kiểm tra Redis trước
    console.time("Redis Get");
    const cachedData = await redis.get(cacheKey);
    console.timeEnd("Redis Get");

    if (cachedData) {
      console.log(`⚡ [UserService] Cache HIT for user ${userId}`);
      return res.json(JSON.parse(cachedData));
    }

    // 2️⃣ CACHE MISS: Nếu không có, gọi Database
    console.log(`🐢 [UserService] Cache MISS for user ${userId}. Fetching DB...`);

    console.time("DB Query");
    const user = await findUserById(userId);
    console.timeEnd("DB Query");

    if (!user) return res.status(404).json({ message: "User not found" });

    // Chuẩn bị response object (không bao gồm password)
    const userResponse = {
      id: user.id,
      email: user.email,
      role: user.role,
      personal_info: user.personal_info,
      vehicle_info: user.vehicle_info
    };

    // 3️⃣ CACHE FILL: Lưu vào Redis cho lần sau (TTL 1 giờ)
    // setex: SET with Expiration
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(userResponse));

    // Trả về thông tin người dùng (ẩn mật khẩu)
    res.json(userResponse);
  } catch (err) {
    // Log lỗi và trả về mã lỗi 500
    console.error("getProfile error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}
