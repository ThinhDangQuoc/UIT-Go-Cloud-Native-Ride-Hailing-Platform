# 🚖 UIT-Go – Cloud-Native Ride Hailing Platform

UIT-Go là đồ án mô phỏng hệ thống gọi xe (Grab/Uber) được thiết kế theo kiến trúc **microservices** gồm:

- 🧍 **UserService** — Quản lý người dùng (đăng ký, đăng nhập, profile)
- 🚕 **TripService** — Xử lý chuyến đi (đặt xe, hủy, hoàn thành, đánh giá)
- 🚗 **DriverService** — Quản lý tài xế, vị trí thời gian thực, và phản hồi chuyến
- 🗺 **Redis** — Lưu toạ độ geospatial của tài xế
- 🗄 **PostgreSQL** — CSDL riêng cho từng service

---

## ⚙️ 1. Yêu cầu môi trường

- Docker ≥ 24.x  
- Docker Compose ≥ 2.x  
- Cổng trống: 8081, 8082, 8083, 5433–5435, 6379  

---

## 📁 2. Cấu trúc thư mục

```
uit-go/
 ├── docker-compose.yml
 ├── user-service/
 │   ├── src/
 │   ├── Dockerfile
 │   └── .env
 ├── driver-service/
 │   ├── src/
 │   ├── Dockerfile
 │   └── .env
 ├── trip-service/
 │   ├── src/
 │   ├── Dockerfile
 │   └── .env
 └── README.md
```

---

## 🐳 3. Chạy toàn bộ hệ thống bằng Docker Compose

Tại thư mục gốc:

```bash
docker compose up --build
```

Docker sẽ tự động:
- Tạo 3 container PostgreSQL (user-db, trip-db, driver-db)
- Khởi chạy Redis (driver-redis)
- Build & chạy 3 service Node.js:
  - `user-service` → http://localhost:8081
  - `driver-service` → http://localhost:8082
  - `trip-service` → http://localhost:8083

Khi thấy log:

```
✅ [user-service] users table ready
🚕 TripService running on port 8083
🚗 DriverService running on port 8082
✅ Redis connection ready
```

→ hệ thống đã sẵn sàng.

---

## 🌐 4. API Endpoints

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

## 🧪 5. Quy trình kiểm thử nhanh

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

---

## 🧰 6. Stack sử dụng

| Thành phần | Công nghệ |
|-------------|------------|
| Runtime | Node.js (Express) |
| Database | PostgreSQL |
| Cache / GeoIndex | Redis (ioredis) |
| Authentication | JWT |
| Container | Docker + Docker Compose |
| Communication | REST (Axios) |
| Realtime | Socket.IO (DriverService) |

---

## 🧹 7. Dừng & dọn dữ liệu

```bash
docker compose down -v
```
Thêm `-v` để xóa dữ liệu database và cache Redis.

---

## ☁️ 8. Triển khai trên AWS

### 8.1 Yêu cầu

- AWS CLI đã cấu hình (`aws configure`)
- Terraform ≥ 1.0
- Tài khoản AWS với quyền tạo VPC, RDS, SQS, Lambda, API Gateway

### 8.2 Kiến trúc AWS

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │  API Gateway │────▶│   AWS SQS    │────▶│ AWS Lambda   │     │
│  │  (REST API)  │     │  (Queue)     │     │ (Consumer)   │     │
│  └──────────────┘     └──────────────┘     └──────┬───────┘     │
│                                                   │              │
│  ┌──────────────────────────────────────────────┐│              │
│  │                    VPC                        ││              │
│  │  ┌────────────────┐  ┌────────────────┐      ││              │
│  │  │ Public Subnet  │  │ Private Subnet │      ││              │
│  │  │                │  │                │      ▼│              │
│  │  │  ┌──────────┐  │  │  ┌──────────┐  │  ┌────────┐         │
│  │  │  │   EC2    │  │  │  │   RDS    │  │  │PostgreSQL│        │
│  │  │  │(Services)│  │  │  │(Postgres)│◀─┼──│(History)│         │
│  │  │  └──────────┘  │  │  └──────────┘  │  └────────┘         │
│  │  └────────────────┘  └────────────────┘                      │
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 Triển khai với Terraform

```bash
# 1. Di chuyển vào thư mục terraform
cd terraform

# 2. Khởi tạo Terraform
terraform init

# 3. Xem trước các resources sẽ tạo
terraform plan

# 4. Triển khai lên AWS
terraform apply

# 5. Xem outputs (API endpoints, queue URLs...)
terraform output
```

### 8.4 Cấu hình biến môi trường

Tạo file `terraform/terraform.tfvars`:

```hcl
# AWS Region
aws_region = "ap-southeast-1"

# VPC Configuration
vpc_cidr             = "10.0.0.0/16"
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.3.0/24", "10.0.4.0/24"]

# RDS Configuration
db_username       = "uitgo_admin"
db_password       = "YourSecurePassword123!"
db_instance_class = "db.t3.micro"

# SQS Configuration
sqs_queue_name = "location-history-queue"

# API Gateway
api_gateway_name = "uitgo-api"
stage_name       = "prod"
```

### 8.5 Modules Terraform

| Module | Mô tả |
|--------|-------|
| `modules/vpc` | VPC, Subnets, Internet Gateway, NAT Gateway |
| `modules/security_group` | Security Groups cho RDS, EC2 |
| `modules/rds` | PostgreSQL RDS instance |
| `modules/sqs` | SQS Queue cho location history |
| `modules/lambda_sqs_consumer` | Lambda function xử lý messages từ SQS |
| `modules/api_gateway` | REST API Gateway |
| `modules/iam` | IAM Roles và Policies |

### 8.6 Dọn dẹp resources AWS

```bash
cd terraform
terraform destroy
```

⚠️ **Lưu ý:** Sẽ xóa TẤT CẢ resources đã tạo trên AWS.

---

## 📊 9. Load Testing

### 9.1 Cài đặt K6

```bash
# Windows (Chocolatey)
choco install k6

# macOS
brew install k6

# Linux
sudo apt install k6
```

### 9.2 Chạy Load Tests

```bash
cd modules/driver-service/load-tests

# Smoke Test (kiểm tra cơ bản)
k6 run 01-smoke-test.js

# Load Test (đo throughput)
k6 run 02-load-test.js

# Stress Test (tìm breaking point)
k6 run 03-stress-test.js

# Spike Test (kiểm tra đột biến)
k6 run 04-spike-test.js

# Soak Test (kiểm tra ổn định dài hạn)
k6 run 05-soak-test.js

# Capacity Test (xác định max capacity)
k6 run 06-capacity-test.js
```

### 9.3 Kết quả Load Test

| Test | Throughput | Success Rate | P95 Latency |
|------|------------|--------------|-------------|
| Smoke | 16 req/s | 100% | 9ms |
| Load | **452 req/s** | 99.98% | 327ms |
| Stress | 473 req/s | 87.34% | 29,999ms |
| Soak | 487 req/s | **100%** | 480ms |

Chi tiết: xem `modules/driver-service/load-tests/LOAD-TEST-REPORT.md`

---

## 📚 10. Tài liệu

| File | Mô tả |
|------|-------|
| `docs/ARCHITECTURE.md` | Kiến trúc hệ thống tổng quan |
| `docs/1-decide-microservices-architecture.md` | ADR: Microservices Architecture |
| `docs/2-decide-redis-for-driver-location.md` | ADR: Redis cho vị trí tài xế |
| `docs/3-decide-rest-over-grpc.md` | ADR: REST thay vì gRPC |
| `docs/REPORT.md` | Báo cáo Module chuyên sâu |
| `terraform/API_GATEWAY_SQS_GUIDE.md` | Hướng dẫn API Gateway + SQS |

---

✨ **UIT-Go - Cloud-Native Ride Hailing Platform**

Được phát triển cho môn học SE360 - Điện toán đám mây @ UIT
