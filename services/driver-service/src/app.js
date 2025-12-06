import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import driverRoutes from "./routes/driverRoutes.js";
import redis, { KEYS } from "./utils/redis.js"; 
import { startDriverConsumer } from "./workers/driverConsumer.js";
import { startLocationBatchWorker } from "./workers/locationBatchWorker.js";
import { locationBuffer } from "./utils/locationBuffer.js";
import { initDB } from "./db/init.js";

dotenv.config();

const app = express();

// === PERFORMANCE OPTIMIZATIONS ===
app.use(compression());           // Gzip response compression
app.use(cors());
app.use(express.json({ limit: '1kb' }));  // Limit body size for location updates

app.use("/api", driverRoutes);

const PORT = process.env.PORT || 8082;
const server = http.createServer(app);

const pubClient = createClient({ url: `redis://${process.env.REDIS_HOST}:6379` });
const subClient = pubClient.duplicate();

pubClient.on("error", (err) => console.error("❌ Redis Adapter Pub Error:", err));
subClient.on("error", (err) => console.error("❌ Redis Adapter Sub Error:", err));

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  console.log("✅ Redis Adapter connected for Auto Scaling");
  
  const io = new Server(server, {
    cors: { origin: "*" },
    adapter: createAdapter(pubClient, subClient) // 👇 Gắn Adapter vào đây
  });

  io.on("connection", (socket) => {
    // console.log(`🔌 Connection: ${socket.id}`);

    // 1️⃣ Dành cho TÀI XẾ: Đăng ký nhận Offer
    socket.on("registerDriver", (driverId) => {
      socket.join(`driver:${driverId}`);
      console.log(`✅ Driver ${driverId} joined room driver:${driverId}`);
    });

    // 2️⃣ Dành cho HÀNH KHÁCH: Theo dõi chuyến đi (User Story 3)
    // Khi khách mở màn hình "Đang đến đón" hoặc "Đang đi", client gửi event này
    socket.on("joinTripRoom", (tripId) => {
      socket.join(`trip:${tripId}`);
      console.log(`👀 Passenger joined tracking room: trip:${tripId}`);
    });

    // 3️⃣ Dành cho TÀI XẾ: Gửi vị trí liên tục (User Story 4)
    socket.on("driverLocationUpdate", async (rawData) => {
      let data = rawData;

      // 🛡️ FIX: Xử lý trường hợp Postman gửi chuỗi JSON thay vì Object
      if (typeof rawData === "string") {
        try {
          data = JSON.parse(rawData);
        } catch (e) {
          console.error("❌ [DEBUG] Invalid JSON string received:", rawData);
          return;
        }
      }

      console.log(`📍 [DEBUG] Received driverLocationUpdate:`, data);
      const { driverId, tripId, lat, lng } = data || {};

      if (!driverId || !lat || !lng) {
        console.error("❌ [DEBUG] Missing required fields in location update");
        return;
      }

      try {
        // A. Lưu vào Redis Geo (Để tìm xe)
        locationBuffer.add({
          driverId,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          tripId,
          heading: data.bearing || 0,
          speed: data.speed || 0
        });
        console.log(`📥 Added to Buffer for Driver ${driverId}`);

        
        // B. Lưu vào Buffer (Để lưu lịch sử DB - Batch Worker xử lý)
        const logEntry = `${driverId}|${lat}|${lng}|${Date.now()}`;
        await redis.rpush(KEYS.LOCATION_BUFFER, logEntry);

        // C. Realtime Tracking (Gửi riêng cho hành khách của chuyến này)
        if (tripId) {
          // Chỉ gửi vào room của chuyến đi cụ thể
          io.to(`trip:${tripId}`).emit("tripLocationUpdate", {
            tripId,
            driverId,
            lat,
            lng,
            bearing: data.bearing || 0, // Hướng xe (nếu có)
            speed: data.speed || 0     // Tốc độ (nếu có)
          });
          // Debug nhẹ
          process.stdout.write(`📍 Streamed to trip:${tripId} > ${lat},${lng}\r`);
        }

      } catch (err) {
        console.error("❌ Location Error:", err.message);
      }
    });

    socket.on("disconnect", () => {
      // console.log(`❌ Disconnected: ${socket.id}`);
    });
  });
  // Start Workers
  startDriverConsumer(io).catch(err => console.error("Driver Consumer Error:", err));
  startLocationBatchWorker().catch(err => console.error("Batch Worker Error:", err));
});

// Check Redis & Start Server
async function checkRedisConnection() {
  try {
    await redis.ping();
    console.log("✅ Redis connection ready");
  } catch (error) {
    console.error("❌ Redis connection error:", error);
    process.exit(1);
  }
}

server.listen(PORT, async () => {
  await checkRedisConnection();
  await initDB();
  console.log(`🚗 DriverService running on port ${PORT}`);
});