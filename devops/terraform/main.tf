terraform {
  
  backend "s3" {
    bucket       = "your-terraform-state-bucket"
    key          = "environments/dev/terraform.tfstate"
    region       = "eu-west-2"
    encrypt      = true
    use_lockfile = true
  }
}

module "route53" {
  source = "./terraform/modules/route53"
  domain = var.DOMAIN
  stage  = var.STAGE
  providers = {
    aws.main             = aws.main
    aws.deployment-us    = aws.deployment-us
    aws.route53-account  = aws.route53-account
  }
}

module "acm_certificate" {
  source         = "./modules/acm_certificate"
  sub_domain     = module.route53.sub_domain
  providers = {
    aws.deployment-us = aws.deployment-us
    aws.deployment-eu = aws.deployment-eu
    aws.route53-account = aws.route53-account
  }
}

module "s3_bucket" {
  source     = "./modules/s3_bucket"
  stage      = var.STAGE
  providers  = { aws.deployment-eu = aws.deployment-eu }
}

module "cloudfront" {
  source              = "./modules/cloudfront"
  s3_bucket_name      = module.s3_bucket.bucket_name
  sub_domain          = module.route53.sub_domain
  acm_certificate_arn = module.acm_certificate.cert_us_east_1_arn
  providers = {
    aws.deployment-eu   = aws.deployment-eu
    aws.route53-account = aws.route53-account
  }
}

module "ssm_parameters" {
  source       = "./modules/ssm_parameters"
  stage        = var.STAGE
  sub_domain   = module.route53.sub_domain
  bucket_name  = module.s3_bucket.bucket_name
  session_token = var.CUSTOMER_SESSION_TOKEN_SECRET
  providers = {
    aws.deployment-eu = aws.deployment-eu
  }
}
