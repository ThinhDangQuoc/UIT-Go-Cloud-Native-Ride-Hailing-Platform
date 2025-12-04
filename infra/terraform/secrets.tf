# 1. Tạo Secret Container (Vỏ bọc)
resource "aws_secretsmanager_secret" "app_secrets" {
  name        = "${var.project_name}-app-secrets"
  description = "Secrets for UIT-Go application (DB, JWT, etc.)"
  
  # Xóa ngay lập tức khi destroy (không chờ 7-30 ngày) - Chỉ dùng cho môi trường Dev/Test
  recovery_window_in_days = 0 
}

# 2. Tạo Secret Version (Giá trị thực tế)
# Trong thực tế, bạn KHÔNG NÊN hardcode giá trị ở đây. 
# Bạn nên tạo resource rỗng, sau đó vào AWS Console điền giá trị thủ công để an toàn.
# Tuy nhiên, để demo chạy được ngay, tôi sẽ set giá trị ban đầu.
resource "aws_secretsmanager_secret_version" "app_secrets_val" {
  secret_id     = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    POSTGRES_PASSWORD = var.db_password
    JWT_SECRET        = "supersecretkey_production_change_me_later"
  })
}