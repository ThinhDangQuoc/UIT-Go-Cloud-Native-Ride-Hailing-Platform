# 1. ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"
}

# 3. Log Group
resource "aws_cloudwatch_log_group" "logs" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "user_service" {
  family                   = "user-service" # Tên nhóm task
  network_mode             = "awsvpc"       # Bắt buộc cho Fargate
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256            # 0.25 vCPU (Tối thiểu để tiết kiệm)
  memory                   = 512            # 512 MB RAM
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_execution_role.arn

  container_definitions = jsonencode([{
    name  = "user-service"
    image = "thinhdan905/uit-go-user-service:latest" # ⚠️ Thay bằng ảnh Docker của bạn
    essential = true
    
    # Port mapping: Container lắng nghe ở cổng 8081 (như trong .env của bạn)
    portMappings = [{
      containerPort = 8081
      hostPort      = 8081
      protocol      = "tcp"
    }]

    # Biến môi trường (Environment Variables)
    # Lấy giá trị từ file variables.tf hoặc output của resource khác
    environment = [
      { name = "PORT",              value = "8081" },
      { name = "ENV",               value = "production" },
      { name = "POSTGRES_HOST",     value = split(":", aws_db_instance.postgres.endpoint)[0] },
      { name = "POSTGRES_PORT",     value = "5432" },
      { name = "POSTGRES_USER",     value = "postgres" },
      { name = "POSTGRES_DB",       value = "user_db" },
      { name = "REDIS_HOST",        value = aws_elasticache_cluster.redis.cache_nodes[0].address },
      { name = "REDIS_PORT",        value = "6379" }
    ]

    secrets = [
      {
        name      = "POSTGRES_PASSWORD"
        valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:POSTGRES_PASSWORD::" 
        # Cú pháp: ARN_SECRET:JSON_KEY::
      },
      {
        name      = "JWT_SECRET"
        valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:JWT_SECRET::"
      }
    ]

    # Cấu hình Log (Đẩy log về CloudWatch để xem online)
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.logs.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "user" # Log sẽ có dạng: user/user-service/xxx
      }
    }
  }])
}

resource "aws_ecs_service" "user_service" {
  name            = "user-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.user_service.arn
  desired_count   = 1 # Số lượng container chạy (Scale = 1 cho demo)
  launch_type     = "FARGATE"

  # Cấu hình mạng cho Service
  network_configuration {
    # Chạy trong Public Subnet để có thể pull image từ Docker Hub
    # Trong production nên chạy Private Subnet + NAT Gateway
    subnets          = [aws_subnet.public_1.id, aws_subnet.public_2.id]
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = true 
  }

  # Load Balancer (Internal)
  # Gắn service này vào Internal ALB để API Gateway có thể gọi tới nó
  load_balancer {
    target_group_arn = aws_lb_target_group.user_service.arn
    container_name   = "user-service"
    container_port   = 8081
  }
}

# 4. Task Definition & Service cho DRIVER-SERVICE
resource "aws_ecs_task_definition" "driver_service" {
  family                   = "driver-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_execution_role.arn

  container_definitions = jsonencode([{
    name  = "driver-service"
    image = "thinhdan905/uit-go-driver-service:latest" # Thay bằng image của bạn
    portMappings = [{
      containerPort = 8082
      hostPort      = 8082
    }]
    environment = [
      { name = "PORT", value = "8082" },
      { name = "REDIS_HOST", value = aws_elasticache_cluster.redis.cache_nodes[0].address },
      { name = "SQS_ENDPOINT", value = "https://sqs.${var.aws_region}.amazonaws.com" }, # AWS thật ko dùng localstack
      { name = "SQS_TRIP_QUEUE_NAME", value = aws_sqs_queue.trip_events.name },
      { name = "TRIP_SERVICE_URL", value = "http://${aws_lb.internal.dns_name}/api" },
      { name = "AWS_REGION", value = var.aws_region },

      # 2. Database (PostgreSQL - RDS)
      # Terraform tự động lấy endpoint từ RDS resource
      { name = "POSTGRES_HOST",     value = split(":", aws_db_instance.postgres.endpoint)[0] },
      { name = "POSTGRES_PORT",     value = "5432" },
      { name = "POSTGRES_USER",     value = aws_db_instance.postgres.username },
      { name = "POSTGRES_DB",       value = "driver_db" },

      # 3. Redis (ElastiCache)
      # Lấy địa chỉ node đầu tiên của cụm Redis
      { name = "REDIS_HOST",        value = aws_elasticache_cluster.redis.cache_nodes[0].address },
      { name = "REDIS_PORT",        value = "6379" }
    ]

    secrets = [
      {
        name      = "POSTGRES_PASSWORD"
        valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:POSTGRES_PASSWORD::" 
        # Cú pháp: ARN_SECRET:JSON_KEY::
      },
      {
        name      = "JWT_SECRET"
        valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:JWT_SECRET::"
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.logs.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "driver"
      }
    }
  }])
}

resource "aws_ecs_service" "driver_service" {
  name            = "driver-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.driver_service.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.public_1.id, aws_subnet.public_2.id]
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = true
  }
  
  load_balancer {
    target_group_arn = aws_lb_target_group.driver_service.arn
    container_name   = "driver-service"
    container_port   = 8082
  }
}

resource "aws_ecs_task_definition" "trip_service" {
  family                   = "trip-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_execution_role.arn
  
  container_definitions = jsonencode([{
    name  = "trip-service"
    image = "thinhdan905/uit-go-trip-service:latest"
    portMappings = [{ 
        containerPort = 8083 
        hostPort      = 8083
    }]
    environment = [
      # 1. Application Config
      { name = "PORT",              value = "8083" },
      { name = "NODE_ENV",          value = "production" },
      
      # 2. Database (RDS PostgreSQL)
      # Terraform tự động lấy endpoint từ resource RDS. Dùng split để tách 'host:port' lấy host
      { name = "POSTGRES_WRITE_HOST", value = split(":", aws_db_instance.postgres.endpoint)[0] },
      { name = "POSTGRES_READ_HOST",  value = split(":", aws_db_instance.postgres.endpoint)[0] }, 
      { name = "POSTGRES_PORT",       value = "5432" },
      { name = "POSTGRES_USER",       value = aws_db_instance.postgres.username },
      { name = "POSTGRES_DB",         value = "trip_db" },

      # 3. Kết nối Service khác (Qua Internal ALB)
      # Các service gọi nhau qua DNS của Load Balancer nội bộ
      { name = "USER_SERVICE_URL",    value = "http://${aws_lb.internal.dns_name}" },
      { name = "DRIVER_SERVICE_URL",  value = "http://${aws_lb.internal.dns_name}" },

      # 4. SQS (Message Queue)
      # AWS SDK tự động lấy Credential từ IAM Task Role, KHÔNG cần truyền ACCESS_KEY/SECRET_KEY
      { name = "AWS_REGION",          value = var.aws_region },
      { name = "SQS_ENDPOINT",        value = "https://sqs.${var.aws_region}.amazonaws.com" }, 
      { name = "SQS_QUEUE_URL",       value = aws_sqs_queue.trip_events.url }
    ]

    secrets = [
      {
        name      = "POSTGRES_PASSWORD"
        valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:POSTGRES_PASSWORD::" 
        # Cú pháp: ARN_SECRET:JSON_KEY::
      },
      {
        name      = "JWT_SECRET"
        valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:JWT_SECRET::"
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.logs.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "trip"
      }
    }
  }])
}

resource "aws_ecs_service" "trip_service" {
  name            = "trip-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.trip_service.arn
  desired_count   = 2
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = [aws_subnet.public_1.id, aws_subnet.public_2.id]
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = true
  }

  # Gắn vào Internal ALB
  load_balancer {
    target_group_arn = aws_lb_target_group.trip_service.arn
    container_name   = "trip-service"
    container_port   = 8083
  }
}

# ... Tương tự cho TRIP-SERVICE và API-GATEWAY
# Riêng API-GATEWAY cần gắn vào Load Balancer

resource "aws_ecs_task_definition" "api_gateway" {
  family                   = "api-gateway"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn

  container_definitions = jsonencode([{
    name  = "api-gateway"
    image = "thinhdan905/uit-go-api-gateway:latest"
    portMappings = [{
      containerPort = 8080
      hostPort      = 8080
    }]
    environment = [
      { name = "PORT", value = "8080" },
      { name = "USER_SERVICE_URL",   value = "http://${aws_lb.internal.dns_name}" },
      { name = "DRIVER_SERVICE_URL", value = "http://${aws_lb.internal.dns_name}" },
      { name = "TRIP_SERVICE_URL",   value = "http://${aws_lb.internal.dns_name}" },
    ]

    secrets = [
      {
        name      = "POSTGRES_PASSWORD"
        valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:POSTGRES_PASSWORD::" 
        # Cú pháp: ARN_SECRET:JSON_KEY::
      },
      {
        name      = "JWT_SECRET"
        valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:JWT_SECRET::"
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.logs.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "gateway"
      }
    }
  }])
}

resource "aws_ecs_service" "api_gateway" {
  name            = "api-gateway"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api_gateway.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.public_1.id, aws_subnet.public_2.id]
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api_gateway.arn
    container_name   = "api-gateway"
    container_port   = 8080
  }
}