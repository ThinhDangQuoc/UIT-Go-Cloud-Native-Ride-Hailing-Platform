# 🚀 HƯỚNG DẪN CHẠY UIT-GO (Step-by-step)

## 📋 Checklist trước khi bắt đầu

### ✅ Phần mềm BẮT BUỘC phải cài

| # | Phần mềm | Cách kiểm tra | Link Download |
|---|----------|---------------|---------------|
| 1 | **Docker Desktop** | Mở app, thấy icon xanh | https://www.docker.com/products/docker-desktop |
| 2 | **Node.js 18+** | `node --version` | https://nodejs.org/ |
| 3 | **Git** | `git --version` | https://git-scm.com/ |

### 📦 Phần mềm KHUYẾN KHÍCH (Optional)

| Phần mềm | Mục đích | Link |
|----------|----------|------|
| **pgAdmin 4** | Xem database PostgreSQL | https://www.pgadmin.org/download/ |
| **RedisInsight** | Xem Redis data (driver locations) | https://redis.com/redis-enterprise/redis-insight/ |
| **Postman** | Test API dễ dàng | https://www.postman.com/downloads/ |
| **K6** | Load testing | `choco install k6` hoặc https://k6.io/docs/get-started/installation/ |

---

## 🖥️ BƯỚC 1: Mở các ứng dụng cần thiết

```
📌 MỞ TRƯỚC:
┌─────────────────────────────────────────────────────────┐
│ 1. Docker Desktop    → Đợi đến khi hiện "Engine running"│
│ 2. VS Code           → Mở folder uit-go                 │
│ 3. PowerShell/Terminal → Mở trong VS Code (Ctrl + `)   │
└─────────────────────────────────────────────────────────┘

📌 MỞ SAU KHI SERVICES CHẠY (Optional):
┌─────────────────────────────────────────────────────────┐
│ 4. pgAdmin           → Kết nối xem database            │
│ 5. RedisInsight      → Xem driver locations            │
│ 6. Postman           → Test APIs                        │
└─────────────────────────────────────────────────────────┘
```

---

## 🐳 BƯỚC 2: Khởi động Docker Containers

### 2.1. Mở Terminal trong VS Code
```
Nhấn: Ctrl + ` (backtick)
```

### 2.2. Di chuyển đến thư mục project
```powershell
cd "E:\Nam_3_HK1\Cloud\uit-go"
```

### 2.3. Khởi động tất cả services
```powershell
# Lần đầu tiên (build images)
docker-compose up --build

# Hoặc chạy background (không block terminal)
docker-compose up --build -d
```

### 2.4. Kiểm tra containers đang chạy
```powershell
docker-compose ps
```

**Kết quả mong đợi:**
```
NAME              STATUS
api-gateway       running (0.0.0.0:8080)
driver-redis      running (0.0.0.0:6379)
driver-service    running (0.0.0.0:8082)
trip-db           running (healthy)
trip-service      running (0.0.0.0:8083)
user-db           running (healthy)
user-service      running (0.0.0.0:8081)
```

### 2.5. Xem logs (nếu cần debug)
```powershell
# Xem tất cả logs
docker-compose logs -f

# Xem logs của 1 service cụ thể
docker-compose logs -f driver-service
docker-compose logs -f api-gateway
```

---

## 🔌 BƯỚC 3: Kết nối pgAdmin (Optional)

### 3.1. Mở pgAdmin 4

### 3.2. Thêm Server mới
```
Right-click "Servers" → Register → Server...
```

### 3.3. Cấu hình kết nối User DB
```
Tab General:
  Name: UIT-Go User DB

Tab Connection:
  Host: localhost
  Port: 5433
  Database: user_db
  Username: postgres
  Password: postgres123
```

### 3.4. Cấu hình kết nối Trip DB
```
Tab General:
  Name: UIT-Go Trip DB

Tab Connection:
  Host: localhost
  Port: 5435
  Database: trip_db
  Username: postgres
  Password: postgres123
```

---

## 🔴 BƯỚC 4: Kết nối RedisInsight (Optional)

### 4.1. Mở RedisInsight

### 4.2. Add Database
```
Host: localhost
Port: 6379
Database Alias: UIT-Go Driver Redis
```

### 4.3. Xem Driver Locations
```
Sau khi connect:
1. Click "Browser"
2. Tìm key: "drivers:locations" → Đây là GEOADD data
3. Tìm keys: "driver:*:meta" → Metadata của drivers
```

---

## 🧪 BƯỚC 5: Test APIs

### 5.1. Test bằng cURL (PowerShell)

```powershell
# Health check API Gateway
curl http://localhost:8080/health

# Đăng ký user mới
curl -X POST http://localhost:8080/api/users/register `
  -H "Content-Type: application/json" `
  -d '{"name":"Test User","email":"test@example.com","password":"123456","phone":"0123456789"}'

# Đăng nhập
curl -X POST http://localhost:8080/api/users/login `
  -H "Content-Type: application/json" `
  -d '{"email":"test@example.com","password":"123456"}'
```

### 5.2. Test Location Update (Tính năng mới)

```powershell
# Lấy token từ login response trước
$token = "YOUR_JWT_TOKEN_HERE"

# Cập nhật vị trí tài xế
curl -X POST http://localhost:8080/api/drivers/driver-001/location `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  -d '{"lat":10.762622,"lng":106.660172,"heading":45,"speed":30}'

# Tìm tài xế gần vị trí (bán kính 5km)
curl "http://localhost:8080/api/drivers/nearby?lat=10.762622&lng=106.660172&radius=5000" `
  -H "Authorization: Bearer $token"
```

### 5.3. Test bằng Postman

#### Bước 1: Mở Postman và tạo Request mới
```
Click "+" để tạo tab mới
```

#### Bước 2: Đăng ký tài khoản
```
Method: POST
URL: http://localhost:8080/api/users/register

Tab "Body":
  - Chọn "raw"
  - Chọn "JSON" (dropdown bên phải)
  - Nhập:
    {
      "email": "test@test.com",
      "password": "123456",
      "role": "passenger"
    }

Click "Send"
```

#### Bước 3: Đăng nhập lấy Token
```
Method: POST
URL: http://localhost:8080/api/users/login

Tab "Body":
  - Chọn "raw" → "JSON"
  - Nhập:
    {
      "email": "test@test.com",
      "password": "123456"
    }

Click "Send"

📌 QUAN TRỌNG: Copy giá trị "token" trong response!
```

#### Bước 4: Sử dụng Token cho các API khác
```
Tab "Authorization":
  - Type: Bearer Token
  - Token: <paste token vừa copy>

HOẶC

Tab "Headers":
  - Key: Authorization
  - Value: Bearer <paste token vừa copy>
```

#### Bước 5: Test Driver Location APIs

**Cập nhật vị trí tài xế:**
```
Method: PUT
URL: http://localhost:8080/api/drivers/driver-001/location

Headers:
  Authorization: Bearer <your_token>

Body (raw JSON):
{
  "lat": 10.762622,
  "lng": 106.660172,
  "heading": 45,
  "speed": 30
}
```

**Tìm tài xế gần vị trí:**
```
Method: GET
URL: http://localhost:8080/api/drivers/search?lat=10.762622&lng=106.660172&radius=5000

Headers:
  Authorization: Bearer <your_token>
```

#### 📋 Tổng hợp tất cả APIs

| Method | URL | Body | Auth |
|--------|-----|------|------|
| POST | `/api/users/register` | `{"email":"...","password":"...","role":"passenger"}` | ❌ |
| POST | `/api/users/login` | `{"email":"...","password":"..."}` | ❌ |
| PUT | `/api/drivers/:id/location` | `{"lat":10.76,"lng":106.66}` | ✅ Bearer |
| GET | `/api/drivers/search?lat=...&lng=...&radius=...` | - | ✅ Bearer |
| GET | `/api/drivers/:id/location` | - | ✅ Bearer |

#### 💡 Tips Postman
```
1. Lưu requests vào Collection để dùng lại
2. Tạo Environment để lưu biến (token, base_url)
3. Dùng {{variable}} để tái sử dụng giá trị
```

---

## 📊 BƯỚC 6: Chạy Load Tests (Optional)

### 6.1. Cài K6
```powershell
# Dùng Chocolatey
choco install k6

# Hoặc download từ https://k6.io/docs/get-started/installation/
```

### 6.2. Chạy Load Test
```powershell
cd "E:\Nam_3_HK1\Cloud\uit-go\modules\driver-service\load-tests"

# Chạy load test cơ bản
k6 run location-update-load-test.js

# Chạy stress test
k6 run stress-test.js

# Chạy với output đẹp hơn
k6 run --out json=results.json location-update-load-test.js
```

---

## 🛑 BƯỚC 7: Dừng services

### 7.1. Dừng tất cả containers
```powershell
docker-compose down
```

### 7.2. Dừng và xóa data (reset hoàn toàn)
```powershell
docker-compose down -v
```

---

## ❓ TROUBLESHOOTING

### Lỗi 1: Port đang được sử dụng
```powershell
# Tìm process dùng port 8080
netstat -ano | findstr :8080

# Kill process (thay PID)
taskkill /PID <PID> /F
```

### Lỗi 2: Docker không chạy
```
Mở Docker Desktop → Settings → General
✅ Check "Start Docker Desktop when you log in"
Restart Docker Desktop
```

### Lỗi 3: Container không start
```powershell
# Xem logs chi tiết
docker-compose logs <service-name>

# Rebuild từ đầu
docker-compose down -v
docker-compose up --build
```

### Lỗi 4: Database connection refused
```
Đợi 10-15 giây sau khi docker-compose up
PostgreSQL cần thời gian khởi động
```

---

## 📁 Cấu trúc Ports

| Service | Port | URL |
|---------|------|-----|
| **API Gateway** | 8080 | http://localhost:8080 |
| **User Service** | 8081 | http://localhost:8081 |
| **Driver Service** | 8082 | http://localhost:8082 |
| **Trip Service** | 8083 | http://localhost:8083 |
| **User DB (PostgreSQL)** | 5433 | localhost:5433 |
| **Trip DB (PostgreSQL)** | 5435 | localhost:5435 |
| **Redis** | 6379 | localhost:6379 |

---

## 🎯 Quick Start (TL;DR)

```powershell
# 1. Mở Docker Desktop (đợi icon xanh)

# 2. Chạy commands
cd "E:\Nam_3_HK1\Cloud\uit-go"
docker-compose up --build -d

# 3. Đợi 30 giây, test API
curl http://localhost:8080/health

# 4. Done! 🎉
```

---

*Hướng dẫn được tạo cho project UIT-Go - 28/11/2025*
