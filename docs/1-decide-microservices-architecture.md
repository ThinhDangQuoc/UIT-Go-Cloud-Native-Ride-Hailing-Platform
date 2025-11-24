# ADR 0001 – Lựa chọn kiến trúc Microservices cho hệ thống UIT-Go

## 1. Bối cảnh
Nhóm cần phát triển hệ thống UIT-Go – nền tảng gọi xe mô phỏng (giống Grab/Uber) với 3 nhóm chức năng tách biệt:
- **Người dùng (UserService)**: đăng ký, đăng nhập, xác thực người dùng (tài xế & hành khách).
- **Tài xế (DriverService)**: cập nhật vị trí, trạng thái online/offline, nhận/chối chuyến.
- **Chuyến đi (TripService)**: tạo, điều phối, theo dõi, và đánh giá chuyến đi.

Ban đầu nhóm cân nhắc hai hướng kiến trúc:
1. **Monolithic** – toàn bộ logic gom chung một backend duy nhất.
2. **Microservices** – tách từng thành phần thành service độc lập, giao tiếp qua API.

Các tiêu chí đánh giá gồm:
- Mức độ mở rộng (scalability)
- Độ cô lập lỗi (fault isolation)
- Dễ bảo trì, triển khai, và kiểm thử
- Độ phức tạp vận hành

## 2. Quyết định
Chọn **kiến trúc Microservices** với ba service chính:
- `user-service`
- `driver-service`
- `trip-service`

Mỗi service:
- Có **Dockerfile**, **database riêng (PostgreSQL)**, và **biến môi trường (.env)** độc lập.
- Giao tiếp nội bộ qua **REST API**.
- Được quản lý và orchestrate bằng **Docker Compose**.

## 3. Lý do
| Tiêu chí | Microservices | Monolithic |
|-----------|----------------|-------------|
| Mở rộng | ✅ Dễ mở rộng từng service | ⚠️ Cần scale toàn hệ thống |
| Cô lập lỗi | ✅ Một service lỗi không ảnh hưởng toàn bộ | ❌ Crash toàn app |
| Bảo trì | ✅ Codebase nhỏ, rõ ràng | ⚠️ Phức tạp, dễ conflict |
| CI/CD | ✅ Dễ triển khai tách biệt | ❌ Build & deploy nặng |
| Hiệu năng | ⚠️ Cần giao tiếp qua mạng | ✅ Nội bộ, nhanh hơn |

## 4. Hậu quả
- **Tăng độ phức tạp kỹ thuật:** cần cấu hình Docker network, cổng, healthcheck.  
- **Tăng overhead giao tiếp:** service → service qua REST.  
- **Cần cơ chế đồng bộ JWT và biến môi trường chung.**

## 5. Bằng chứng thực nghiệm
Khi thử triển khai phiên bản monolithic, nhóm nhận thấy:
- Khi lỗi đăng nhập xảy ra, toàn bộ hệ thống phải restart.
- CI/CD khó chia tách build.
Sau khi chuyển sang microservices:
- `user-service` có thể restart độc lập.
- Dễ trace log, dễ kiểm thử bằng Postman từng service.

## 6. Kế hoạch mở rộng
- Dễ thêm các service mới: NotificationService, PaymentService.  
- Có thể chuyển sang Kubernetes khi triển khai cloud.

**Kết luận:** Microservices mang lại khả năng mở rộng, bảo trì và quản lý tốt hơn, phù hợp với mục tiêu của đồ án.
