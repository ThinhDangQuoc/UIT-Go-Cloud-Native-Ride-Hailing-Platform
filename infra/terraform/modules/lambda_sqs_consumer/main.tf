resource "aws_iam_role" "lambda_sqs_consumer_role" {
  name = var.lambda_role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_sqs_consumer_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "lambda_sqs_policy" {
  name = "${var.lambda_role_name}-sqs-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = var.sqs_queue_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attach_sqs_policy" {
  role       = aws_iam_role.lambda_sqs_consumer_role.name
  policy_arn = aws_iam_policy.lambda_sqs_policy.arn
}

resource "aws_lambda_function" "sqs_consumer" {
  filename         = var.lambda_zip_file
  function_name    = var.lambda_function_name
  role             = aws_iam_role.lambda_sqs_consumer_role.arn
  handler          = var.lambda_handler
  source_code_hash = filebase64sha256(var.lambda_zip_file)
  timeout          = var.lambda_timeout

  tags = {
    Name = var.lambda_function_name
  }
}

resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn = var.sqs_queue_arn
  function_name    = aws_lambda_function.sqs_consumer.function_name
  batch_size       = var.lambda_batch_size
}

output "lambda_function_arn" {
  value = aws_lambda_function.sqs_consumer.arn
}

output "lambda_role_arn" {
  value = aws_iam_role.lambda_sqs_consumer_role.arn
}
