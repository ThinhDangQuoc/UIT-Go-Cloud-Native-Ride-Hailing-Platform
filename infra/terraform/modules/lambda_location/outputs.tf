output "lambda_function_arn" {
  description = "ARN of the location history Lambda function"
  value       = aws_lambda_function.location_history.arn
}

output "lambda_function_name" {
  description = "Name of the location history Lambda function"
  value       = aws_lambda_function.location_history.function_name
}

output "lambda_role_arn" {
  description = "ARN of the Lambda IAM role"
  value       = aws_iam_role.location_lambda.arn
}

output "log_group_name" {
  description = "CloudWatch Log Group name"
  value       = aws_cloudwatch_log_group.location_lambda.name
}
