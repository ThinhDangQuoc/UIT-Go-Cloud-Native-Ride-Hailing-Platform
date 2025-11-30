# 1. ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"
}

# 2. IAM Role cho ECS Task (Để container có quyền gọi SQS, Logs...)
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${var.project_name}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Cho phép task gọi SQS
resource "aws_iam_role_policy" "ecs_sqs_policy" {
  name = "ecs-sqs-policy"
  role = aws_iam_role.ecs_task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["sqs:*"]
      Resource = "*"
    }]
  })
}

# 3. Log Group
resource "aws_cloudwatch_log_group" "logs" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 7
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
    image = "your-dockerhub-username/driver-service:latest" # Thay bằng image của bạn
    portMappings = [{
      containerPort = 8082
      hostPort      = 8082
    }]
    environment = [
      { name = "PORT", value = "8082" },
      { name = "REDIS_HOST", value = aws_elasticache_cluster.redis.cache_nodes[0].address },
      { name = "SQS_ENDPOINT", value = "https://sqs.${var.aws_region}.amazonaws.com" }, # AWS thật ko dùng localstack
      { name = "SQS_TRIP_QUEUE_NAME", value = aws_sqs_queue.trip_events.name },
      { name = "AWS_REGION", value = var.aws_region }
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
  
  # Service Discovery để các service gọi nhau bằng tên (driver-service.local)
  # Cần cấu hình thêm AWS Cloud Map nếu muốn gọi nội bộ không qua ALB
  # Ở đây demo đơn giản, các service gọi nhau qua Private IP hoặc Internal ALB (cần setup thêm)
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
    image = "your-dockerhub-username/api-gateway:latest"
    portMappings = [{
      containerPort = 8080
      hostPort      = 8080
    }]
    environment = [
      { name = "PORT", value = "8080" },
      # URL các service con cần cấu hình Service Discovery hoặc Internal ALB
      # Tạm thời demo có thể hardcode IP hoặc dùng CloudMap sau
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