 

  
#AWS Provider with profile main account
provider "aws" {
  region = var.REGION
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}


provider "aws" {
  region = var.REGION
  alias = "route53-domain"   # Specify a default AWS region here
  profile = "indyauction-${var.DOMAIN_ACCOUNT}"
}

#AWS Provider with profile Stage account
provider "aws" {
  region = var.REGION
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

########
locals {
  sub_domain = var.STAGE == "prod" ? var.DOMAIN : "${var.STAGE}.${var.DOMAIN}"
}

#Fetches the data from Main Domain Hosted Zones
data "aws_route53_zone" "domain_zone" {
  name = local.sub_domain # Replace with your domain name
  provider = aws.route53-domain
}

data "aws_acm_certificate" "existing_certificate" {
  domain   = "*.${local.sub_domain}"
  statuses = ["ISSUED", "PENDING_VALIDATION"] # Specify certificate statuses you want to consider as "existing"
  provider = aws.deployment-us
}

#creates a API DOMAIN NAME with ACM certificate generated for regional configuration
resource "aws_api_gateway_domain_name" "dev_api" {
  domain_name              = "apis.${local.sub_domain}"
  regional_certificate_arn = data.aws_acm_certificate.existing_certificate.arn

  endpoint_configuration {
    types = ["REGIONAL"]
  }
  #depends_on = [
  #  aws_acm_certificate.cert_us_east_1,
  #  aws_route53_record.route_53_certificate_records_us_east_1,
  #]
  provider = aws.deployment-us
}

# Adds DNS record of newly created API domain name to Hosted Zone in main acc using Route53.
resource "aws_route53_record" "record_updater" {
  name    = "apis.${local.sub_domain}"
  type    = "A"
  zone_id = data.aws_route53_zone.domain_zone.zone_id
  provider = aws.route53-domain
  
  #configures the domain name and Cname which will be added in hosted zone
  alias {
    evaluate_target_health = true
    name                   = aws_api_gateway_domain_name.dev_api.regional_domain_name
    zone_id                = aws_api_gateway_domain_name.dev_api.regional_zone_id
  }
}

#Creates a variabe store in ssm_parameter store
resource "aws_ssm_parameter" "api_gateway_domain_name" {
  name  = "DOMAIN_NAME"
  type  = "String"
  value = "apis.${local.sub_domain}"
  provider = aws.deployment-us
  overwrite = true
}
resource "aws_ssm_parameter" "api_gateway_domain_name_frontend" {
  name  = "DOMAIN_NAME_FRONT_END"
  type  = "String"
  value = "https://apis.${local.sub_domain}"
  provider = aws.deployment-us
  overwrite = true
}
resource "aws_ssm_parameter" "api_gateway_certificate" {
  name  = "DOMAIN_CERTIFICATE"
  type  = "String"
  value = "*.${local.sub_domain}"
  provider = aws.deployment-us
  overwrite = true
}
