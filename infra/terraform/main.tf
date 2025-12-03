module "vpc" {
  source = "./modules/vpc"

  vpc_cidr               = var.vpc_cidr
  public_subnet_cidrs    = var.public_subnet_cidrs
  private_subnet_cidrs   = var.private_subnet_cidrs
}

module "sg" {
  source = "./modules/security_group"

  vpc_id     = module.vpc.vpc_id
  admin_cidr = var.admin_cidr
}

module "iam" {
  source = "./modules/iam"
}

module "rds" {
  source = "./modules/rds"

  db_username        = var.db_username
  db_password        = var.db_password
  db_instance_class  = var.db_instance_class
  subnet_ids         = module.vpc.private_subnet_ids
  vpc_security_group_ids = [module.sg.db_sg_id]
}

module "sqs" {
  source = "./modules/sqs"

  queue_name        = var.sqs_queue_name
  visibility_timeout = var.sqs_visibility_timeout
  message_retention = var.sqs_message_retention
  api_gateway_arn   = module.api_gateway.resource_arn
}

module "api_gateway" {
  source = "./modules/api_gateway"

  api_name           = var.api_gateway_name
  api_description    = var.api_gateway_description
  queue_resource_path = var.queue_resource_path
  stage_name         = var.stage_name
  aws_region         = var.aws_region
  sqs_queue_url      = module.sqs.queue_url
  sqs_queue_arn      = module.sqs.queue_arn
}

module "lambda_sqs_consumer" {
  source = "./modules/lambda_sqs_consumer"

  lambda_role_name      = var.lambda_role_name
  lambda_function_name  = var.lambda_function_name
  lambda_handler        = var.lambda_handler
  lambda_zip_file       = var.lambda_zip_file
  lambda_timeout        = var.lambda_timeout
  lambda_batch_size     = var.lambda_batch_size
  sqs_queue_arn         = module.sqs.queue_arn
}