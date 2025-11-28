variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "uitgo"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "lambda_zip_file" {
  description = "Path to Lambda deployment package"
  type        = string
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 60
}

variable "lambda_memory" {
  description = "Lambda memory in MB"
  type        = number
  default     = 256
}

variable "reserved_concurrency" {
  description = "Reserved concurrent executions"
  type        = number
  default     = 10
}

variable "max_concurrency" {
  description = "Maximum concurrent Lambda invocations"
  type        = number
  default     = 50
}

variable "batch_size" {
  description = "SQS batch size per Lambda invocation"
  type        = number
  default     = 100
}

variable "batching_window" {
  description = "Maximum batching window in seconds"
  type        = number
  default     = 5
}

variable "sqs_queue_arn" {
  description = "ARN of the SQS queue to consume from"
  type        = string
}

variable "subnet_ids" {
  description = "VPC subnet IDs for Lambda"
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs for Lambda"
  type        = list(string)
}

variable "db_host" {
  description = "PostgreSQL host"
  type        = string
}

variable "db_port" {
  description = "PostgreSQL port"
  type        = string
  default     = "5432"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
}

variable "db_user" {
  description = "PostgreSQL username"
  type        = string
}

variable "db_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic for CloudWatch alarms"
  type        = string
  default     = ""
}
