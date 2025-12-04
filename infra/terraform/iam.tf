# -----------------------------------------------------------
# 1. ECS TASK EXECUTION ROLE (Quyền cho ECS Agent)
# -----------------------------------------------------------

# Tạo Role
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${var.project_name}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
}

# Gắn Policy chuẩn của AWS cho Execution Role
# (Cho phép kéo image ECR và ghi log CloudWatch)
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


# -----------------------------------------------------------
# 2. ECS TASK ROLE (Quyền cho Code Node.js của bạn)
# -----------------------------------------------------------

# Tạo Role
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.project_name}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
}

# Policy tùy chỉnh: Cho phép gọi SQS
resource "aws_iam_policy" "sqs_access_policy" {
  name        = "${var.project_name}-sqs-access"
  description = "Allow ECS tasks to access SQS"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl"
        ]
        Resource = "*" # Trong production nên giới hạn ARN cụ thể của Queue
      }
    ]
  })
}

# Policy tùy chỉnh: Cho phép gọi S3 (nếu cần upload ảnh)
resource "aws_iam_policy" "s3_access_policy" {
  name        = "${var.project_name}-s3-access"
  description = "Allow ECS tasks to access S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.project_name}-assets-*",
          "arn:aws:s3:::${var.project_name}-assets-*/*"
        ]
      }
    ]
  })
}

# Gắn Policy vào Task Role
resource "aws_iam_role_policy_attachment" "task_sqs_attachment" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.sqs_access_policy.arn
}

resource "aws_iam_policy" "secrets_access_policy" {
  name        = "${var.project_name}-secrets-access"
  description = "Allow ECS tasks to read secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "kms:Decrypt" # Cần thiết nếu secret được mã hóa bằng KMS key riêng
        ]
        # Chỉ cho phép đọc đúng secret của app này (Least Privilege)
        Resource = [aws_secretsmanager_secret.app_secrets.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_secrets_attachment" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = aws_iam_policy.secrets_access_policy.arn
}

# Gắn quyền S3 (nếu dùng)
# resource "aws_iam_role_policy_attachment" "task_s3_attachment" {
#   role       = aws_iam_role.ecs_task_role.name
#   policy_arn = aws_iam_policy.s3_access_policy.arn
# }