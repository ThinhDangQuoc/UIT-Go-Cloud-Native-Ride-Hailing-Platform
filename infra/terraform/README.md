## 📂 Cấu trúc Terraform

```
terraform/              # Code Terraform để deploy lên AWS
├── scripts/            # Script hỗ trợ Terraform (ví dụ: init.sql)
├── alb.tf              # Cấu hình Application Load Balancer (Public & Internal)
├── autoscaling.tf      # Cấu hình Auto Scaling Group cho ECS Services
├── db_init.tf          # Resource chạy script khởi tạo Database (Seed data)
├── ecs.tf              # Cấu hình ECS Cluster, Task Definitions, Services (Fargate)
├── iam.tf              # Cấu hình quyền truy cập (IAM Roles & Policies)
├── main.tf             # File chính, cấu hình Data sources và Service Discovery
├── outputs.tf          # Định nghĩa các giá trị xuất ra sau khi deploy (URL, Endpoint)
├── provider.tf         # Khai báo AWS Provider và Version
├── rds.tf              # Cấu hình Database (PostgreSQL)
├── redis.tf            # Cấu hình ElastiCache (Redis Cluster)
├── secrets.tf          # Cấu hình AWS Secrets Manager (Lưu pass DB, JWT Secret)
├── security_groups.tf  # Cấu hình tường lửa (Security Groups) cho các resource
├── sqs.tf              # Cấu hình Message Queue (AWS SQS)
├── variables.tf        # Khai báo các biến số dùng chung (Region, Project Name...)
├── vpc.tf              # Cấu hình mạng (VPC, Subnets, Internet Gateway, Route Table)
└── waf.tf              # Cấu hình Web Application Firewall (Bảo vệ API Gateway)
```

## Kiến trúc AWS

## Hướng dẫn Deploy lên AWS

### Bước 1: Chuẩn bị 
1. Cài đặt AWS CLI, Terraform và Docker.
2. Cấu hình AWS CLI với tài khoản của bạn: `aws configure`

### Bước 2: Khởi tạo hạ tầng với Terraform
1. Đi tởi thư mục chứa file Terraform.
2. Chạy lệnh:

```
terraform init
terraform plan
terraform apply
```

3. Nhập mật khẩu khi được hỏi.
4. Lưu lại các Output: Sau khi chạy xong, Terraform sẽ in ra các URL của SQS, Endpoint của RDS và Redis.

### Bước 3: Đóng gói Docker
Bạn cần đẩy code lên AWS ECR (Elastic Container Registry).
1. Tạo repository trên AWS ECR cho `user-service`, `driver-service` và `trip-service`.
2. Build và push image:

```
# Đăng nhập ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <your-account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build & Push Driver Service
docker build -t driver-service ./path-to-driver-service
docker tag driver-service:latest <your-account-id>[.dkr.ecr.us-east-1.amazonaws.com/driver-service:latest](https://.dkr.ecr.us-east-1.amazonaws.com/driver-service:latest)
docker push <your-account-id>[.dkr.ecr.us-east-1.amazonaws.com/driver-service:latest](https://.dkr.ecr.us-east-1.amazonaws.com/driver-service:latest)

# Làm tương tự cho User Service và Trip Service
```

### Bước 4: Kiểm tra
1. Xem Logs trong CloudWatch để đảm bảo ứng dụng khởi động thành công và kết nối được Redis/DB.
2. Gửi request tạo Trip và kiểm tra xem Driver Service có nhận được message từ SQS không.
