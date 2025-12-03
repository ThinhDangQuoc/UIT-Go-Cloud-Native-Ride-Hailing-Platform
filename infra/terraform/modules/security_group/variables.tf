variable "vpc_id" {
  type = string
}

variable "admin_cidr" {
  type    = string
  default = "0.0.0.0/0"
}

variable "app_cidr" {
  type    = string
  default = "0.0.0.0/0"
}
