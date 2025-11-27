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