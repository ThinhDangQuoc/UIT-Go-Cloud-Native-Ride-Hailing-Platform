import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import driverRoutes from "./routes/driverRoutes.js";
import redis, { KEYS } from "./utils/redis.js";
import { initDB } from "./db/init.js";
import { startDriverConsumer } from "./workers/driverConsumer.js";
import { startLocationBatchWorker } from "./workers/locationBatchWorker.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Đăng ký các route của DriverService
app.use("/api", driverRoutes);

const PORT = process.env.PORT || 8082;
const server = http.createServer(app);

// ✅ Khởi tạo Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // hoặc domain frontend của bạn
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log(`🚘 Driver connected: ${socket.id}`);
  socket.on("registerDriver", (driverId) => {
    socket.join(`driver:${driverId}`); // Join room riêng
    console.log(`✅ Driver ${driverId} joined room driver:${driverId}`);
  });

  // 📡 Driver gửi vị trí mỗi vài giây
  socket.on("driverLocationUpdate", async ({ driverId, lat, lng }) => {
    if (!driverId || !lat || !lng) return;

    try {
      await redis.geoadd(KEYS.DRIVERS_LOCATIONS, lng, lat, driverId);
      const logEntry = `${driverId}|${lat}|${lng}|${Date.now()}`;
      await redis.rpush(KEYS.LOCATION_BUFFER, logEntry);
      io.emit("driverLocationBroadcast", { driverId, lat, lng }); // Gửi cho mọi passenger
      console.log(`📍 Updated location for driver ${driverId}: ${lat}, ${lng}`);
    } catch (err) {
      console.error("Redis GEOADD error:", err.message);
    }
  });

  socket.on("disconnect", () => {
    console.log(`❌ Driver disconnected: ${socket.id}`);
  });
});

// start consumer (non-blocking)
startDriverConsumer(io).catch(err => {
  console.error("Driver consumer failed to start:", err);
});

startLocationBatchWorker().catch(err => console.error("Batch Worker Error:", err));

// Kiểm tra kết nối Redis trước khi khởi động server
async function checkRedisConnection() {
  try {
    await redis.ping();
    console.log("✅Redis connection ready");
  } catch (error) {
    console.error("❌Redis connection error:", error);
    process.exit(1);
  }
}

// Khởi động server sau khi Redis sẵn sàng
server.listen(PORT, async () => {
  await checkRedisConnection();
  await initDB();
  console.log(`🚗DriverService running on port ${PORT}`);
});
