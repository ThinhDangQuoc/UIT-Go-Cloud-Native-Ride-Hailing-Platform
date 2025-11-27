variable "queue_name" {
  type = string
}

variable "visibility_timeout" {
  type    = number
  default = 300
}

variable "message_retention" {
  type    = number
  default = 345600
}

variable "receive_wait_time" {
  type    = number
  default = 0
}

variable "api_gateway_arn" {
  type = string
}
