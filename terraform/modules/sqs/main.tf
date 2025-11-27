resource "aws_sqs_queue" "main" {
  name                      = var.queue_name
  visibility_timeout_seconds = var.visibility_timeout
  message_retention_seconds  = var.message_retention
  receive_wait_time_seconds = var.receive_wait_time
  
  tags = {
    Name = var.queue_name
  }
}

resource "aws_sqs_queue_policy" "main" {
  queue_url = aws_sqs_queue.main.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
        Action = "sqs:SendMessage"
        Resource = aws_sqs_queue.main.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = var.api_gateway_arn
          }
        }
      }
    ]
  })
}

output "queue_url" {
  value = aws_sqs_queue.main.url
}

output "queue_arn" {
  value = aws_sqs_queue.main.arn
}
