# Architecture Overview

Tài liệu này đóng vai trò là tài liệu kỹ thuật cho dự án UIT-Go — một nền tảng gọi xe dựa trên kiến trúc microservices, được phát triển trong khuôn khổ môn học SE360 tại UIT.
Mục tiêu của tài liệu là giúp các thành viên đóng góp nhanh chóng nắm bắt được toàn bộ kiến trúc và mã nguồn, từ đó dễ dàng hợp tác và mở rộng phát triển trong tương lai.

---

## 1. Cấu trúc dự án (Project Structure)

Phần này mô tả tổng quan cấp cao về cấu trúc thư mục và cách tổ chức theo các tầng kiến trúc.

```
[Project Root]/
├── user-service/              # Quản lý người dùng, xác thực và JWT
│   ├── src/
│   │   ├── controllers/       # Xử lý các route đăng ký, đăng nhập, hồ sơ người dùng
│   │   ├── models/            # Các truy vấn cơ sở dữ liệu cho user
│   │   ├── middleware/        # Middleware xác thực JWT
│   │   ├── db/                # Kết nối PostgreSQL và khởi tạo bảng
│   │   └── routes/            # Định nghĩa các route API
│   ├── .env                   # Biến môi trường của user-service
│   ├── Dockerfile
│   └── package.json
│
├── driver-service/            # Quản lý dữ liệu tài xế, xử lý logic nhận cuốc xe, theo dõi vị trí (Redis Geo)
│   ├── src/
│   │   ├── controllers/       # Đăng ký, nhận/từ chối cuốc xe, vị trí
│   │   ├── models/            # Truy vấn SQL cho tài xế
│   │   ├── utils/             # Hàm tiện ích hỗ trợ Redis Geo
│   │   ├── db/                # Khởi tạo PostgreSQL + Redis
│   │   └── routes/            # Định nghĩa router cho driver-service
│   ├── .env                   # Biến môi trường của driver-service
│   ├── Dockerfile
│   └── package.json
│
├── trip-service/              # Quản lý chuyến đi, gán tài xế, đánh giá
│   ├── src/
│   │   ├── controllers/       # Logic cốt lõi của chuyến đi, đánh giá
│   │   ├── models/            # Model cho Trip 
│   │   ├── services/          # Gọi Axios tới driver-service
│   │   ├── middleware/        # Middleware xác thực JWT
│   │   ├── utils/             # Hằng số và hàm hỗ trợ
│   │   ├── db/                # Khởi tạo schema PostgreSQL
│   │   └── routes/            # Định nghĩa đường dẫn dành cho trip
│   ├── .env                   # Biến môi trường của trip-service
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml          # Dàn dựng và chạy toàn bộ microservices
├── README.md                   # Tổng quan dự án
└── ARCHITECTURE.md             # Tài liệu này
```

---

## 2. Sơ đồ tổng quan hệ thống (High-Level System Diagram)
```
   +---------------------+
   |       Người dùng    |
   | (Passenger / Driver)|
   +---------+-----------+
             |
             v
   +---------------------+          +---------------------+
   |  Trip Service       |<-------->|  Driver Service     |
   |  (Điều phối chuyến) |          |  (Định vị + phản hồi)|
   +---------------------+          +---------------------+
             ^
             |
   +---------------------+
   |  User Service       |
   | (Đăng ký / đăng nhập)|
   +---------------------+

   [PostgreSQL] User Service và Trip Service  |
   [Redis Geospatial] Driver service
```

Các service giao tiếp **qua REST API** bằng Axios.  
Dữ liệu vị trí tài xế lưu trong **Redis GEO**, mỗi service có **database riêng biệt**.

---

## 3. Luồng dữ liệu chi tiết (Data Flow)

### A. Đăng ký & xác thực người dùng
1. Passenger gửi `POST /users` → UserService tạo user (PostgreSQL).  
2. Gửi `POST /sessions` → Nhận JWT token.  
3. Token được dùng cho mọi API khác.  

**Luồng:** Client ↔ UserService ↔ PostgreSQL(users).

---

### B. Tài xế bật online & cập nhật vị trí
1. Driver gửi `PUT /drivers/:id/status` → status = “online”.  
2. Gửi `PUT /drivers/:id/location` → Redis GEOADD lưu (lat,lng).  

**Luồng:** Driver ↔ DriverService ↔ Redis(drivers_locations).

---

### C. Hành khách đặt chuyến
1. Passenger gửi `POST /trips` → TripService lưu chuyến trong PostgreSQL.  
2. TripService gọi `driver-service/drivers/search` để tìm tài xế gần nhất.  
3. Gửi `POST /drivers/:id/notify` đến driver.  
4. Chờ phản hồi (15s timeout).  

**Luồng:** Passenger → TripService → DriverService → Redis → PostgreSQL(trips).

---

### D. Tài xế phản hồi chuyến
1. Driver gửi `POST /drivers/:id/trips/:tripId/accept`.  
2. DriverService gọi `trip-service/trips/:tripId/accept`.  
3. TripService cập nhật trạng thái “accepted”.  

**Luồng:** Driver ↔ DriverService ↔ TripService ↔ PostgreSQL(trips).

---

### E. Hoàn thành & đánh giá chuyến đi
1. Passenger gửi `POST /trips/:id/complete`.  
2. TripService cập nhật `status=completed`.  
3. Passenger gửi `POST /trips/:id/review` (rating/comment).  

**Luồng:** Passenger ↔ TripService ↔ PostgreSQL(trips).

---

### Data Flow Summary:
1.Hành khách đăng ký / đăng nhập → User Service phát hành JWT.

2.Hành khách tạo chuyến đi → Trip Service lưu vào cơ sở dữ liệu.

3.Trip Service gọi Driver Service qua REST API để tìm tài xế gần nhất (sử dụng Redis Geo).

4.Chuyến đi được gán cho tài xế gần nhất.

5.Khi nhận request, tài xế quyết định nhận/từ chối

6.Hành khách có thể hủy chuyến hoặc tiếp tục 

7.Khi chuyến đi hoàn tất → hành khách gửi đánh giá (yêu cầu JWT).

8.Tất cả các service giao tiếp thông qua REST và chạy trong các container Docker.

---

## 4. Core Components

### 4.1. Frontend
**(Dự kiến phát triển trong tương lai)**  
Một dashboard web hoặc ứng dụng di động sẽ tiêu thụ các API từ backend.
Công nghệ đề xuất: React.js hoặc Flutter.

---

### 4.2. Backend Services

#### 4.2.1. User Service
**Chức năng:**  
- Quản lý người dùng (hành khách, tài xế).  
- Đăng ký, đăng nhập, lấy thông tin cá nhân.  
- Sinh **JWT Token** thống nhất cho toàn hệ thống.  

**Công nghệ:** Node.js (Express), PostgreSQL, bcrypt, JWT.  
**Triển khai:** Docker container `user-service` (cổng 8081).  

---

#### 4.2.2. Driver Service
**Chức năng:**  
- Quản lý tài xế, vị trí và trạng thái online/offline.  
- Cập nhật vị trí bằng Redis GEOADD.  
- Hỗ trợ phản hồi accept/reject chuyến đi.  

**Công nghệ:** Node.js (Express), Redis (ioredis), Socket.IO.  
**Triển khai:** Docker container `driver-service` (cổng 8082).  

---

#### 4.2.3. Trip Service
**Chức năng:**  
- Là **trung tâm điều phối** giữa hành khách và tài xế.  
- Khi hành khách đặt xe:
  1. Lưu chuyến đi vào PostgreSQL.
  2. Gọi `driver-service` tìm tài xế gần nhất (qua Redis).
  3. Gửi thông báo đến tài xế.
  4. Cập nhật trạng thái chuyến.

**Công nghệ:** Node.js (Express), PostgreSQL, Axios.  
**Triển khai:** Docker container `trip-service` (cổng 8083).  

---

## 5. Data Stores

### 5.1. PostgreSQL (User & Trip Services)
**Type:** Relational Database  
**Purpose:** Lưu trữ lâu dài tài khoản người dùng, lịch sử chuyến đi và đánh giá.

**Key Tables:**
- `users` →
id (SERIAL PRIMARY KEY) — id người dùng.

email (VARCHAR(255), UNIQUE, NOT NULL) — Email dùng để đăng nhập.

password_hash (VARCHAR(255), NOT NULL) — Hash mật khẩu 

role (VARCHAR(50), NOT NULL) — Vai trò người dùng

personal_info (JSONB) — Thông tin cá nhân mở rộng

vehicle_info (JSONB) — Thông tin phương tiện

created_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP) — Thời điểm tạo tài khoản.

- `trips` →
id (SERIAL PRIMARY KEY) — Khóa chính chuyến đi.

passenger_id (INTEGER NOT NULL) — Tham chiếu tới users.id của hành khách.

driver_id (INTEGER) — Tham chiếu tới users.id của tài xế 

pickup (VARCHAR(255) NOT NULL) — Địa điểm đón 

destination (VARCHAR(255) NOT NULL) — Địa điểm trả khách.

fare (NUMERIC(10,2) NOT NULL) — Giá tiền chuyến đi.

status (VARCHAR(50) DEFAULT 'searching') — Trạng thái chuyến 

rating (INTEGER CHECK (rating BETWEEN 1 AND 5)) — Điểm đánh giá chuyến

comment (TEXT) — Bình luận/đánh giá kèm theo.

created_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP) — Thời điểm tạo chuyến.

### 5.2. Redis (Driver Service)
**Type:** CSDL trong bộ nhớ, có chỉ mục không gian địa lý (GeoSpatial)
**Purpose:** Lưu và truy vấn vị trí tài xế nhanh chóng.
**Key Data Structures:**  
- `drivers:locations` (GeoSet chứa ID và tọa độ của tài xế.)

---

## 6. Deployment & Infrastructure

**Cloud Provider:** Docker (phát triển cục bộ), có thể mở rộng lên Render, AWS hoặc GCP.

**Key Components:**
- Mỗi microservice chạy trong một container riêng.
- File .env chứa thông tin đăng nhập (PostgreSQL, Redis host, cổng, v.v.).
- `docker-compose.yml` điều phối quá trình khởi động các service.

**CI/CD:** Đề xuất sử dụng GitHub Actions.
**Giám sát (tương lai):** Prometheus + Grafana stack.

---

## 7. Security Considerations

- **Authentication:** JWT (HMAC SHA256).  
- **Authorization:** Middleware kiểm tra JWT cho các route bảo vệ (/api/trips/:id/review)
- **Data Encryption:** TLS (trong môi trường production) 
- **Password Storage:** Băm bằng bcrypt (User Service)
- **Environment Secrets:** Lưu trong `.env`

---

## 8. Development & Testing Environment

**Local Setup:**
```bash
git clone https://github.com/ThinhDangQuoc/uit-go.git
cd uit-go
docker compose up --build
```

**Testing:** Thủ công bằng Postman hoặc test tích hợp trong tương lai với Jest.
**Code Quality:** Sử dụng ESLint và Prettier cho Node.js.

---

## 9. Future Considerations / Roadmap

Thiết kế Kiến trúc cho Scalability & Performance
---

## 10. Project Identification

| Field | Value |
|-------|--------|
| **Project Name** | UIT-Go |
| **Primary Contact** | Hồ Nhật Thành - Đặng Quốc Thịnh - Tạ Ngọc Thành |
| **Team / Course** | SE360 - Software Engineering (UIT) |
| **Date of Last Update** | 2025-10-29 |

---

## 11. Glossary / Acronyms

| Acronym | Meaning |
|----------|----------|
| **JWT** | JSON Web Token |
| **API** | Application Programming Interface |
| **DB** | Database |
| **CI/CD** | Continuous Integration / Continuous Deployment |
| **K8s** | Kubernetes |
| **REST** | Representational State Transfer |

---

👉 *End of Document — maintained by Hồ Nhật Thành, SE360 - UIT-Go Project.*
