resource "aws_security_group" "app" {
  name   = "tf-app-sg"
  vpc_id = var.vpc_id

  description = "Allow HTTP/HTTPS from internet"

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.app_cidr]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.app_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "bastion" {
  name   = "tf-bastion-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name   = "tf-db-sg"
  vpc_id = var.vpc_id

  ingress {
    description = "Postgres from app SG"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

output "app_sg_id" { value = aws_security_group.app.id }
output "bastion_sg_id" { value = aws_security_group.bastion.id }
output "db_sg_id" { value = aws_security_group.db.id }
