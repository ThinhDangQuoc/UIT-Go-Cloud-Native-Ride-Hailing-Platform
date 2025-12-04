variable "aws_region" {
  description = "AWS Region"
  default     = "us-east-1"
}

variable "project_name" {
  description = "Tên project"
  default     = "uit-go"
}

variable "db_password" {
  description = "Password cho Database"
  type        = string
  sensitive   = true # Đánh dấu là dữ liệu nhạy cảm
}