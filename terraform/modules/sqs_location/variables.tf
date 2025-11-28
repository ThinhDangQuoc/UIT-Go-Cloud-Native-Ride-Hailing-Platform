variable "project_name" {
  description = "Project name prefix for resources"
  type        = string
  default     = "uitgo"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "driver_service_role_arn" {
  description = "IAM role ARN for driver service (to send messages)"
  type        = string
}

variable "lambda_role_arn" {
  description = "IAM role ARN for Lambda functions (to consume messages)"
  type        = string
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms (optional)"
  type        = string
  default     = ""
}
