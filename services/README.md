# 🧱 UIT-GO Microservices

Thư mục này chứa mã nguồn của các dịch vụ độc lập. Các dịch vụ giao tiếp với nhau thông qua HTTP (REST) và Message Queue (SQS).

---

## 1. Danh sách các Services

| Service Name | Port | Mô tả | Dependencies |
|--------|-----------|-------| ---------------|
| API Gateway | 8080 | Cổng vào duy nhất, route request tới các service con, Authentication. | None |
| User Service | 8081 | Quản lý thông tin người dùng, xác thực (Auth). | PostgreSQL |
| Driver Service | 8082 | Quản lý tài xế, cập nhật vị trí (Socket.IO), nhận chuyến. | PostgreSQL, Redis, SQS |
| Trip Service | 8083 | Quản lý vòng đời chuyến đi, tính tiền, push job tìm xe. | PostgreSQL, SQS |

---

## 2. Giao tiếp giữa các Service

1. Đồng bộ (Synchronous - HTTP)
- Client -> API Gateway -> TripService/DriverService

2. Bất đồng bộ (Asynchronous - Event Driven)
- Luồng tạo chuyến:
    1. TripService nhận request tạo chuyến.
    2. TripService đẩy message TRIP_CREATED vào AWS SQS.
    3. DriverService (Consumer) polling SQS để nhận message.
    4. DriverService tìm tài xế gần nhất qua Redis Geo và bắn Socket thông báo.

3. Real-time (Socket.IO)
- Driver -> Server: Gửi tọa độ GPS (driverLocationUpdate).
- Server -> Driver: Gửi thông báo có khách (tripOffer).

---

## 3. API Endpoints

### 🧍 User Service (http://localhost:8081/api)
| Method | Endpoint | Mô tả |
|--------|-----------|-------|
| POST | `/users` | Đăng ký tài khoản |
| POST | `/sessions` | Đăng nhập (nhận JWT) |
| GET | `/users/me` | Lấy thông tin cá nhân |

---

### 🚕 Trip Service (http://localhost:8083/api)
| Method | Endpoint | Mô tả |
|--------|-----------|-------|
| POST | `/trips` | Tạo chuyến đi mới |
| POST | `/trips/:id/cancel` | Hủy chuyến |
| POST | `/trips/:id/complete` | Hoàn thành chuyến |
| POST | `/trips/:id/review` | Đánh giá tài xế |
| GET  | `/trips/:id` | Lấy thông tin chuyến |
| POST | `/trips/:id/accept` | (DriverService gọi nội bộ) |
| POST | `/trips/:id/reject` | (DriverService gọi nội bộ) |

---

### 🚗 Driver Service (http://localhost:8082/api)
| Method | Endpoint | Mô tả |
|--------|-----------|-------|
| PUT | `/drivers/:id/location` | Cập nhật vị trí (lat,lng) |
| GET | `/drivers/search` | Tìm tài xế gần nhất |
| PUT | `/drivers/:id/status` | Cập nhật trạng thái online/offline |
| POST | `/drivers/:id/trips/:tripId/accept` | Chấp nhận chuyến |
| POST | `/drivers/:id/trips/:tripId/reject` | Từ chối chuyến |

---

## 4. Quy trình kiểm thử nhanh

1. **Đăng ký & đăng nhập passenger**
   ```bash
   curl -X POST http://localhost:8081/api/users      -H "Content-Type: application/json"      -d '{"email":"passenger@example.com","password":"123456","role":"passenger"}'
   ```
   → lưu `token` trả về.

2. **Đăng ký & đăng nhập driver** tương tự với `"role":"driver"`.

3. **Driver bật online + cập nhật vị trí**
   ```bash
   curl -X PUT http://localhost:8082/api/drivers/1/status      -H "Authorization: Bearer <JWT_DRIVER>"      -H "Content-Type: application/json"      -d '{"status":"online"}'

   curl -X PUT http://localhost:8082/api/drivers/1/location      -H "Authorization: Bearer <JWT_DRIVER>"      -H "Content-Type: application/json"      -d '{"lat":10.87,"lng":106.8}'
   ```

4. **Passenger tạo chuyến**
   ```bash
   curl -X POST http://localhost:8083/api/trips      -H "Authorization: Bearer <JWT_PASSENGER>"      -H "Content-Type: application/json"      -d '{"passengerId":1,"pickup":"UIT","destination":"Ben Thanh","pickupLat":10.87,"pickupLng":106.8}'
   ```

5. **Driver chấp nhận chuyến**
   ```bash
   curl -X POST http://localhost:8082/api/drivers/1/trips/1/accept      -H "Authorization: Bearer <JWT_DRIVER>"
   ```

6. **Passenger hoàn thành & đánh giá chuyến**
   ```bash
   curl -X POST http://localhost:8083/api/trips/1/complete      -H "Authorization: Bearer <JWT_PASSENGER>"
   curl -X POST http://localhost:8083/api/trips/1/review      -H "Authorization: Bearer <JWT_PASSENGER>"      -H "Content-Type: application/json"      -d '{"rating":5,"comment":"Good driver!"}'
   ```