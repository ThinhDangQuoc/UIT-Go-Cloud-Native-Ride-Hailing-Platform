variable "api_name" {
  type = string
}

variable "api_description" {
  type    = string
  default = "API Gateway for SQS message queuing"
}

variable "queue_resource_path" {
  type    = string
  default = "messages"
}

variable "stage_name" {
  type    = string
  default = "prod"
}

variable "aws_region" {
  type = string
}

variable "sqs_queue_url" {
  type = string
}

variable "sqs_queue_arn" {
  type = string
}

variable "request_template" {
  type    = string
  default = <<EOF
{
  "Action": "SendMessage",
  "MessageBody": $input.json('$'),
  "QueueUrl": "$input.params('QueueUrl')"
}
EOF
}

variable "response_template" {
  type    = string
  default = <<EOF
{
  "Message": "Message sent successfully",
  "MessageId": "$input.path('$.MD5OfMessageBody')"
}
EOF
}
