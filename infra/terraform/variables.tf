variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "admin_cidr" {
  type    = string
  default = "0.0.0.0/0"
}

variable "db_username" {
  type    = string
  default = "postgres"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "sqs_queue_name" {
  type    = string
  default = "uit-go-message-queue"
}

variable "sqs_visibility_timeout" {
  type    = number
  default = 300
}

variable "sqs_message_retention" {
  type    = number
  default = 345600
}

variable "api_gateway_name" {
  type    = string
  default = "uit-go-api"
}

variable "api_gateway_description" {
  type    = string
  default = "API Gateway for async message processing via SQS"
}

variable "queue_resource_path" {
  type    = string
  default = "messages"
}

variable "stage_name" {
  type    = string
  default = "prod"
}

variable "lambda_role_name" {
  type    = string
  default = "uit-go-lambda-sqs-consumer-role"
}

variable "lambda_function_name" {
  type    = string
  default = "uit-go-sqs-consumer"
}

variable "lambda_handler" {
  type    = string
  default = "index.handler"
}

variable "lambda_zip_file" {
  type    = string
  default = "lambda_function.zip"
}

variable "lambda_timeout" {
  type    = number
  default = 60
}

variable "lambda_batch_size" {
  type    = number
  default = 10
}