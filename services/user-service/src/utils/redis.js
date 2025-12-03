import Redis from 'ioredis';

// Kết nối Redis, dùng để lưu vị trí và trạng thái tài xế
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  connectTimeout: 10000, // Timeout kết nối 10s
  maxRetriesPerRequest: 3, // Chỉ thử lại 3 lần rồi báo lỗi
  retryStrategy: (times) => {
    if (times > 3) {
      console.error("❌ [Redis] Could not connect after 3 attempts.");
      return null; // Stop retrying
    }
    return Math.min(times * 50, 2000);
  },
});

redis.on("connect", () => {
  console.log("✅ [Redis] Connected successfully!");
});

redis.on("error", (err) => {
  console.error("❌ [Redis] Connection Error:", err.message);
});

// Các key chuẩn hóa trong Redis
export const KEYS = {
  DRIVERS_LOCATIONS: 'drivers_locations', // vị trí tài xế (geo set)
  DRIVER_STATUS: 'driver_status:',        // trạng thái tài xế (prefix)
  LOCATION_BUFFER: "location_buffer"      // Key Buffer (List) - MỚI
};

export default redis;
