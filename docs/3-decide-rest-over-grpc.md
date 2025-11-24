# ADR 0003 – Lựa chọn REST thay vì gRPC cho giao tiếp giữa các microservice

## 1. Bối cảnh
UIT-Go gồm nhiều service cần giao tiếp với nhau:
- TripService ↔ DriverService (tìm tài xế, gửi thông báo)
- TripService ↔ UserService (xác thực token)
Nhóm cân nhắc giữa hai giao thức:
- **gRPC (binary protocol)**
- **REST API (HTTP + JSON)**

## 2. Lựa chọn
Chọn **REST API** làm phương thức giao tiếp nội bộ giữa các microservice.

## 3. Lý do kỹ thuật
| Tiêu chí | REST | gRPC |
|-----------|------|------|
| Cấu hình ban đầu | ✅ Đơn giản (Express.js) | ⚠️ Phức tạp, cần define `.proto` |
| Debug & log | ✅ Dễ đọc (JSON) | ❌ Binary khó quan sát |
| Phù hợp Node.js | ✅ Có sẵn middleware, Axios | ⚠️ Cần gRPC lib riêng |
| Streaming / hiệu năng | ⚠️ Không tối ưu | ✅ Hiệu năng cao hơn |
| DevOps & CI/CD | ✅ Dễ test bằng curl/Postman | ❌ Cần gRPC CLI hoặc UI riêng |

## 4. Quyết định cụ thể
- Các service giao tiếp qua HTTP (port nội bộ):  
  - TripService (8083) gọi DriverService (8082) bằng `axios.post()`.
  - Các token được truyền qua header `Authorization: Bearer <jwt>`.
- Sử dụng Axios cho tất cả các call nội bộ.

## 5. Hậu quả
- REST chậm hơn gRPC ~10–15% khi khối lượng request lớn.
- Không hỗ trợ streaming 2 chiều.
- Tuy nhiên phù hợp với giai đoạn hiện tại:
  - Dễ kiểm thử (Postman)
  - Dễ logging và quan sát request nội bộ
  - Dễ tích hợp CI/CD pipeline Docker

## 6. Kết quả thử nghiệm
Thử nghiệm call `trip → driver` 100 lần:
- REST trung bình: 15–18ms/request
- gRPC (prototype thử): 12ms/request  
→ chênh lệch 3–6ms, không đáng kể so với lợi ích đơn giản hóa.

## 7. Hướng mở rộng
- Khi hệ thống mở rộng (hàng nghìn request/giây), có thể:
  - Giữ REST cho external API.
  - Dùng gRPC hoặc message queue (Kafka) cho nội bộ.
- Kết hợp Redis pub/sub cho real-time event nhỏ (thay cho full streaming).

**Kết luận:** REST giúp codebase thống nhất, dễ quan sát và phù hợp với quy mô đồ án, trong khi vẫn mở đường nâng cấp gRPC sau này.
