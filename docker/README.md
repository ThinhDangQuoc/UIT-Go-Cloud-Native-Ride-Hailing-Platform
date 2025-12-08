## Các dịch vụ hiện có

| Service           | Port (Host)       | Container Port | Replicas | Mô tả                              |
|-------------------|-------------------|----------------|----------|------------------------------------|
| `api-gateway`     | `8080`            | 8080           | 1        | API Gateway (Traefik/Kong hoặc custom) |
| `user-service`    | `8081`            | 8081           | 1        | Quản lý người dùng hành khách     |
| `driver-service`  | `8084` → `8087`   | 8082           | 4        | Quản lý tài xế (scale 4 instances) |
| `trip-service`    | `8083`            | 8083           | 1        | Quản lý chuyến đi, matching        |
| `user-db`         | `5433`            | 5432           | -        | PostgreSQL cho user-service        |
| `driver-db`       | `5434`            | 5432           | -        | PostgreSQL cho driver-service      |
| `trip-db`         | `5435`            | 5432           | -        | PostgreSQL cho trip-service        |
| `user-redis`      | `6380`            | 6379           | -        | Redis cho user-service             |
| `driver-redis`    | `6379`            | 6379           | -        | Redis cho driver-service (đã tối ưu) |
| `localstack`      | `4566`            | 4566           | -        | AWS SQS giả lập (dùng awslocal)    |

##  Truy cập các service

| Địa chỉ | Mô tả | 
|-----------------------|-------------------|
| http://localhost:8080 | API Gateway (điểm vào duy nhất)            | 
| http://localhost:8081 | User Service trực tiếp            | 
| http://localhost:8084 | Driver Service instance 1   | 
| http://localhost:8085 | Driver Service instance 2            | 
| http://localhost:8086 | Driver Service instance 2            | 
| http://localhost:8087 | Driver Service instance 2            | 
| http://localhost:8083 | Trip Service instance            | 
| http://localhost:5433 | Database của User            | 
| http://localhost:5434 | Database của Driver            | 
| http://localhost:5435 | Database của Trip            | 
| http://localhost:6380 | Redis cho User            | 
| http://localhost:6379 | Redis cho Driver            | 
| http://localhost:4566 | AWS SQS giả lập (dùng awslocal)            |

## LocalStack - AWS SQS
- Các queue sẽ tự động được tạo bởi script: `../infra/localstack/init-sqs.sh`
- Dùng `awslocal` để tương tác (đã cài trong container):

```bash
docker exec -it localstack awslocal sqs list-queues
```

## Dừng và xóa toàn bộ
```bash
docker compose down -v        # Xóa cả volume (DB sẽ mất dữ liệu)
# hoặc
docker compose down           # Giữ lại dữ liệu DB
```

## Tối ưu hiệu năng (Driver Service)

- Đã scale thành 4 replicas
- Mỗi instance giới hạn: 0.5 CPU + 512 MB RAM