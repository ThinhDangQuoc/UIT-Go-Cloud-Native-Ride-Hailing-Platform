# ADR 0002 – Sử dụng Redis Geospatial cho quản lý vị trí tài xế

## 1. Bối cảnh
Hệ thống cần lưu **tọa độ (latitude, longitude)** của hàng chục tài xế online cùng lúc.  
Yêu cầu:
- Cập nhật liên tục (mỗi 2–5 giây)
- Tìm tài xế gần một vị trí cho trước (search radius)
- Hiệu năng cao, độ trễ thấp

Nhóm cân nhắc 3 giải pháp:
| Giải pháp | Mô tả | Ưu điểm | Nhược điểm |
|------------|--------|----------|-------------|
| PostgreSQL + PostGIS | Dùng extension geospatial | Lưu dài hạn, chuẩn hóa | Quá nặng, truy vấn chậm, tốn CPU |
| In-memory (RAM) JS Map | Lưu trong Node server | Đơn giản | Không chia sẻ được giữa các container |
| **Redis Geospatial** | Dùng GEOADD, GEORADIUS | Truy vấn cực nhanh, chia sẻ đa instance | Không lưu dài hạn |

## 2. Quyết định
Chọn **Redis Geospatial** để quản lý vị trí tài xế.

- Mỗi tài xế có `id` được lưu cùng `(lat, lng)` vào Redis key `drivers_locations`.
- Khi passenger đặt xe, TripService gọi DriverService → Redis để tìm tài xế trong bán kính (km).
- Redis trả về danh sách tài xế theo thứ tự khoảng cách.

## 3. Lý do kỹ thuật
- **Hiệu năng cao:** Redis truy vấn trung bình <1ms cho 10k điểm.  
- **Hỗ trợ tìm kiếm theo bán kính (GEORADIUS):** phù hợp logic "tìm tài xế gần nhất".  
- **Dễ mở rộng:** nhiều DriverService có thể truy cập Redis chung.  
- **Không cần tính toán địa lý thủ công.**

## 4. Ảnh hưởng đến codebase
- Thêm module `utils/redis.js` kết nối Redis bằng `ioredis`.  
- Cập nhật `driverController.js`:
  ```js
  await redis.geoadd("drivers_locations", lng, lat, driverId);
  const nearby = await redis.georadius("drivers_locations", lng, lat, radius, "km", "WITHCOORD");

Cần config container driver-redis trong docker-compose.yml.

## Hậu quả
- Mất dữ liệu vị trí nếu Redis restart (chấp nhận được vì vị trí cập nhật liên tục).
- Phải triển khai thêm Redis container, tăng tài nguyên.
- Cần đồng bộ giữa Redis (vị trí) và PostgreSQL (trạng thái online/offline).
