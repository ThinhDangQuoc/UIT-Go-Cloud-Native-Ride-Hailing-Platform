resource "null_resource" "db_setup" {
  # Chỉ chạy sau khi RDS đã sẵn sàng
  depends_on = [aws_db_instance.postgres]

  # Trigger: Chỉ chạy lại nếu file init.sql thay đổi hoặc Endpoint DB thay đổi
  triggers = {
    sql_hash = filemd5("${path.module}/scripts/init.sql")
    db_endpoint = aws_db_instance.postgres.endpoint
  }

  provisioner "local-exec" {
    # Lệnh chạy trên máy tính của bạn (Cần cài sẵn psql client)
    command = "PGPASSWORD='${var.db_password}' psql -h ${split(":", aws_db_instance.postgres.endpoint)[0]} -p 5432 -U ${aws_db_instance.postgres.username} -d postgres -f ${path.module}/scripts/init.sql"
    
    # Biến môi trường (Nếu cần)
    environment = {
      PGSSLMODE = "require" 
    }
  }
}