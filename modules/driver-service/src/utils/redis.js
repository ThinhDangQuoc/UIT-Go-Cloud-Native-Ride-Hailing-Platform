import Redis from 'ioredis';

/**
 * ============================================================
 * REDIS CONNECTION POOL OPTIMIZATION
 * ============================================================
 * Tối ưu hóa cho high-throughput location updates:
 * 
 * 1. Connection Pool: Tăng số lượng connection đồng thời
 * 2. KeepAlive: Giữ connection sống, giảm latency
 * 3. Pipeline: Tự động batching commands
 * 4. LazyConnect: Không block startup
 * ============================================================
 */

// Cấu hình tối ưu cho high-throughput
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  
  // === CONNECTION POOLING ===
  // ioredis không có connection pool built-in như node-redis
  // nhưng có thể tối ưu bằng các setting sau:
  
  // Timeout và retry optimization
  connectTimeout: 5000,          // Giảm từ 10s → 5s (fail fast)
  commandTimeout: 3000,          // Timeout cho mỗi command
  maxRetriesPerRequest: 1,       // Giảm retry để fail fast
  enableReadyCheck: true,        // Đảm bảo Redis ready trước khi dùng
  
  // === KEEP-ALIVE & PERFORMANCE ===
  keepAlive: 1000,               // TCP keepalive mỗi 1s
  noDelay: true,                 // Disable Nagle's algorithm (reduce latency)
  
  // === AUTO-PIPELINING ===
  // Tự động batch các commands gần nhau
  enableAutoPipelining: true,    // ⭐ Key optimization cho high throughput
  autoPipelineQueueSize: 200,    // Batch up to 200 commands
  
  // === LAZY CONNECT ===
  lazyConnect: false,            // Connect immediately on startup
  
  retryStrategy: (times) => {
    if (times > 3) {
      console.error("❌ [Redis] Could not connect after 3 attempts.");
      return null;
    }
    return Math.min(times * 100, 2000);
  },
};

const redis = new Redis(redisConfig);

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
