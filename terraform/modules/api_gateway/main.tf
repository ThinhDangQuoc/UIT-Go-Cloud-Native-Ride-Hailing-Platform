resource "aws_api_gateway_rest_api" "main" {
  name        = var.api_name
  description = var.api_description
  
  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Name = var.api_name
  }
}

resource "aws_api_gateway_resource" "queue_resource" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = var.queue_resource_path
}

resource "aws_api_gateway_method" "post_queue" {
  rest_api_id      = aws_api_gateway_rest_api.main.id
  resource_id      = aws_api_gateway_resource.queue_resource.id
  http_method      = "POST"
  authorization    = "NONE"

  request_parameters = {
    "method.request.header.Content-Type" = true
  }
}

resource "aws_api_gateway_integration" "sqs_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.queue_resource.id
  http_method             = aws_api_gateway_method.post_queue.http_method
  type                    = "AWS"
  integration_http_method = "POST"
  uri                     = "arn:aws:apigateway:${var.aws_region}:sqs:path/${var.sqs_queue_url}"
  credentials             = aws_iam_role.api_gateway_role.arn

  request_templates = {
    "application/json" = var.request_template
  }
}

resource "aws_api_gateway_integration_response" "sqs_response" {
  rest_api_id       = aws_api_gateway_rest_api.main.id
  resource_id       = aws_api_gateway_resource.queue_resource.id
  http_method       = aws_api_gateway_method.post_queue.http_method
  status_code       = "200"

  response_templates = {
    "application/json" = var.response_template
  }

  depends_on = [aws_api_gateway_integration.sqs_integration]
}

resource "aws_api_gateway_method_response" "response_200" {
  rest_api_id      = aws_api_gateway_rest_api.main.id
  resource_id      = aws_api_gateway_resource.queue_resource.id
  http_method      = aws_api_gateway_method.post_queue.http_method
  status_code      = "200"

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  
  depends_on = [
    aws_api_gateway_integration.sqs_integration,
    aws_api_gateway_integration_response.sqs_response,
    aws_api_gateway_method_response.response_200
  ]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = var.stage_name

  xray_tracing_enabled = true
  
  tags = {
    Name = "${var.api_name}-${var.stage_name}"
  }
}

resource "aws_iam_role" "api_gateway_role" {
  name = "${var.api_name}-api-gw-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_policy" "api_gateway_sqs_policy" {
  name = "${var.api_name}-api-gw-sqs-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage"
        ]
        Resource = var.sqs_queue_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attach_sqs_policy" {
  role       = aws_iam_role.api_gateway_role.name
  policy_arn = aws_iam_policy.api_gateway_sqs_policy.arn
}

output "api_id" {
  value = aws_api_gateway_rest_api.main.id
}

output "api_endpoint" {
  value = aws_api_gateway_stage.main.invoke_url
}

output "resource_arn" {
  value = "arn:aws:execute-api:${var.aws_region}:${data.aws_caller_identity.current.account_id}:${aws_api_gateway_rest_api.main.id}/*"
}

data "aws_caller_identity" "current" {}
