# =====================================================
# Lambda Function for Location History Batch Writer
# Consumes from SQS and batch inserts to PostgreSQL
# =====================================================

# IAM Role for Lambda
resource "aws_iam_role" "location_lambda" {
  name = "${var.project_name}-location-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-location-lambda-role"
    Environment = var.environment
  }
}

# IAM Policy for Lambda execution
resource "aws_iam_role_policy" "location_lambda" {
  name = "${var.project_name}-location-lambda-policy"
  role = aws_iam_role.location_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:DeleteMessageBatch",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = var.sqs_queue_arn
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface"
        ]
        Resource = "*"
      }
    ]
  })
}

# Lambda function
resource "aws_lambda_function" "location_history" {
  filename         = var.lambda_zip_file
  function_name    = "${var.project_name}-location-history-writer"
  role             = aws_iam_role.location_lambda.arn
  handler          = "location_history_handler.handler"
  runtime          = "python3.11"
  timeout          = var.lambda_timeout
  memory_size      = var.lambda_memory
  
  # VPC configuration for RDS access
  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  environment {
    variables = {
      DB_HOST     = var.db_host
      DB_PORT     = var.db_port
      DB_NAME     = var.db_name
      DB_USER     = var.db_user
      DB_PASSWORD = var.db_password
    }
  }

  # Reserved concurrency for predictable scaling
  reserved_concurrent_executions = var.reserved_concurrency

  tags = {
    Name        = "${var.project_name}-location-history-writer"
    Environment = var.environment
  }
}

# SQS Event Source Mapping
resource "aws_lambda_event_source_mapping" "location_history" {
  event_source_arn                   = var.sqs_queue_arn
  function_name                      = aws_lambda_function.location_history.arn
  batch_size                         = var.batch_size
  maximum_batching_window_in_seconds = var.batching_window
  enabled                            = true

  # Partial batch response for error handling
  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = var.max_concurrency
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "location_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.location_history.function_name}"
  retention_in_days = 14

  tags = {
    Name        = "${var.project_name}-location-lambda-logs"
    Environment = var.environment
  }
}

# CloudWatch Alarm for Lambda errors
resource "aws_cloudwatch_metric_alarm" "location_lambda_errors" {
  alarm_name          = "${var.project_name}-location-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Location history Lambda function errors"

  dimensions = {
    FunctionName = aws_lambda_function.location_history.function_name
  }

  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []

  tags = {
    Name        = "${var.project_name}-location-lambda-alarm"
    Environment = var.environment
  }
}
