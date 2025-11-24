import Redis from 'ioredis';

// Kết nối Redis, dùng để lưu vị trí và trạng thái tài xế
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
});

// Các key chuẩn hóa trong Redis
export const KEYS = {
  DRIVERS_LOCATIONS: 'drivers_locations', // vị trí tài xế (geo set)
  DRIVER_STATUS: 'driver_status:',        // trạng thái tài xế (prefix)
};

export default redis;
