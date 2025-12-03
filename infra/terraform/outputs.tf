output "vpc_id" {
  value = module.vpc.vpc_id
}

output "public_subnet_ids" {
  value = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  value = module.vpc.private_subnet_ids
}

output "db_endpoint" {
  value     = module.rds.db_endpoint
  sensitive = true
}

output "sqs_queue_url" {
  value = module.sqs.queue_url
}

output "sqs_queue_arn" {
  value = module.sqs.queue_arn
}

output "api_gateway_endpoint" {
  value = module.api_gateway.api_endpoint
}

output "api_gateway_id" {
  value = module.api_gateway.api_id
}

output "lambda_function_arn" {
  value = module.lambda_sqs_consumer.lambda_function_arn
}