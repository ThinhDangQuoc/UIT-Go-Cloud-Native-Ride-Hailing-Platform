data "aws_availability_zones" "available" {
  state = "available"
}

# Lấy thông tin về Account ID hiện tại (để dùng trong ARN của IAM policy)
data "aws_caller_identity" "current" {}

# Tạo Namespace cho Service Discovery (Để các service gọi nhau bằng tên miền nội bộ)
# Ví dụ: http://trip-service.local:8083
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "local"
  description = "Service Discovery Namespace for Microservices"
  vpc         = aws_vpc.main.id
}

# (Optional) Tạo S3 Bucket để lưu trữ ảnh/file nếu cần
resource "aws_s3_bucket" "app_assets" {
  bucket = "${var.project_name}-assets-${data.aws_caller_identity.current.account_id}"
  
  tags = {
    Name = "${var.project_name}-assets"
  }
}