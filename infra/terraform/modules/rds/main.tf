resource "aws_db_subnet_group" "db_subnets" {
  name       = "tf-db-subnet-group"
  subnet_ids = var.subnet_ids
  tags = { Name = "tf-db-subnet-group" }
}

resource "aws_db_instance" "postgres" {
  identifier = "tf-postgres"
  engine = "postgres"
  instance_class = var.db_instance_class
  allocated_storage = 20
  username = var.db_username
  password = var.db_password
  db_subnet_group_name = aws_db_subnet_group.db_subnets.name
  vpc_security_group_ids = var.vpc_security_group_ids
  skip_final_snapshot = true
  publicly_accessible = false
  tags = { Name = "tf-postgres" }
}

output "db_endpoint" {
  value = aws_db_instance.postgres.address
}
