# -----------------------------------------------------------
# 1. PUBLIC ALB (Dành cho API Gateway - Internet Facing)
# -----------------------------------------------------------

# Security Group cho Public ALB (Mở port 80 cho internet)
resource "aws_security_group" "public_alb_sg" {
  name        = "${var.project_name}-public-alb-sg"
  description = "Allow HTTP traffic from internet"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "public" {
  name               = "${var.project_name}-public-alb"
  internal           = false # False = Public
  load_balancer_type = "application"
  security_groups    = [aws_security_group.public_alb_sg.id]
  subnets            = [aws_subnet.public_1.id, aws_subnet.public_2.id]
}

# Target Group cho API Gateway
resource "aws_lb_target_group" "api_gateway" {
  name        = "${var.project_name}-gateway-tg"
  port        = 8080
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id
  
  health_check {
    path = "/" # Hoặc /health nếu có
    matcher = "200-499"
  }
}

# Listener Public (Forward mọi request vào API Gateway)
resource "aws_lb_listener" "public_http" {
  load_balancer_arn = aws_lb.public.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api_gateway.arn
  }
}

# -----------------------------------------------------------
# 2. INTERNAL ALB (Dành cho Microservices gọi nhau - Private)
# -----------------------------------------------------------

# Security Group cho Internal ALB (Chỉ mở cho nội bộ VPC)
resource "aws_security_group" "internal_alb_sg" {
  name        = "${var.project_name}-internal-alb-sg"
  description = "Allow internal traffic only"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block] # Chỉ nhận request từ trong VPC
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Resource này đang thiếu trong code cũ của bạn
resource "aws_lb" "internal" {
  name               = "${var.project_name}-internal-alb"
  internal           = true # True = Private
  load_balancer_type = "application"
  security_groups    = [aws_security_group.internal_alb_sg.id]
  subnets            = [aws_subnet.public_1.id, aws_subnet.public_2.id]
}

# --- TARGET GROUPS CHO INTERNAL SERVICES ---

# Target Group: Driver Service
resource "aws_lb_target_group" "driver_service" {
  name        = "${var.project_name}-driver-tg"
  port        = 8082
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id
  health_check { 
    path = "/"
    matcher = "200-499" 
  }
}

# Target Group: Trip Service
resource "aws_lb_target_group" "trip_service" {
  name        = "${var.project_name}-trip-tg"
  port        = 8083
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id
  health_check { 
    path = "/"
    matcher = "200-499" 
  }
}

# Target Group: User Service (Resource này đang thiếu, gây lỗi undeclared)
resource "aws_lb_target_group" "user_service" {
  name        = "${var.project_name}-user-tg"
  port        = 8081
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id
  health_check { 
    path = "/"
    matcher = "200-499" 
  }
}

# --- LISTENER & RULES CHO INTERNAL ALB ---

resource "aws_lb_listener" "internal_http" {
  load_balancer_arn = aws_lb.internal.arn
  port              = "80"
  protocol          = "HTTP"

  # Mặc định trả về 404 nếu không khớp rule nào
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found (Internal ALB)"
      status_code  = "404"
    }
  }
}

# Rule 1: /api/drivers/* -> Driver Service
resource "aws_lb_listener_rule" "driver_routing" {
  listener_arn = aws_lb_listener.internal_http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.driver_service.arn
  }

  condition {
    path_pattern {
      values = ["/api/drivers*"]
    }
  }
}

# Rule 2: /api/trips/* -> Trip Service
resource "aws_lb_listener_rule" "trip_routing" {
  listener_arn = aws_lb_listener.internal_http.arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.trip_service.arn
  }

  condition {
    path_pattern {
      values = ["/api/trips*"]
    }
  }
}

# Rule 3: /api/users/* -> User Service
resource "aws_lb_listener_rule" "user_routing" {
  listener_arn = aws_lb_listener.internal_http.arn
  priority     = 300

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.user_service.arn
  }

  condition {
    path_pattern {
      values = ["/api/users*", "/api/sessions*"]
    }
  }
}