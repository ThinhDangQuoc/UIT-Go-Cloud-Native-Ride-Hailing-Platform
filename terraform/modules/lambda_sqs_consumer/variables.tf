variable "lambda_role_name" {
  type = string
}

variable "lambda_function_name" {
  type = string
}

variable "lambda_handler" {
  type    = string
  default = "index.handler"
}

variable "lambda_zip_file" {
  type = string
}

variable "lambda_timeout" {
  type    = number
  default = 60
}

variable "lambda_batch_size" {
  type    = number
  default = 10
}

variable "sqs_queue_arn" {
  type = string
}
