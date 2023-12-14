#variabe default region
variable "REGION" {
  description = "AWS region"
  default     = "eu-west-2" # Default region if the environment variable is not set
}

#variable default domain name
variable "DOMAIN" {
  description = "Domain"
  default     = "indyauction.net" # Default region if the environment variable is not set
}

#variable default stage
variable "STAGE" {
  description = "AWS Stage"
  default     = "dev" # Default region if the environment variable is not set
}

#AWS Provider with profile main account
provider "aws" {
  region = "eu-west-2"
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-main"
}

#AWS Provider with profile Stage account
provider "aws" {
  region = "eu-west-2"
  alias = "deployment-ap"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

#Default AWS region for variable
provider "aws" {
  region = var.REGION
}

variable "certificate_domain" {
  type        = string
  description = "Domain name for ACM certificate"
  default     = "*.indyauction.net"
}

########

#Fetches the data from Main Domain Hosted Zones
data "aws_route53_zone" "domain_zone" {
  name = var.DOMAIN # Replace with your domain name
  provider = aws.main
}

data "aws_acm_certificate" "existing_certificate" {
  domain   = var.certificate_domain
  statuses = ["ISSUED", "PENDING_VALIDATION"] # Specify certificate statuses you want to consider as "existing"
  provider = aws.deployment-ap
}

#creates a API DOMAIN NAME with ACM certificate generated for regional configuration
resource "aws_api_gateway_domain_name" "dev_api" {
  domain_name              = "apis-${var.STAGE}.${var.DOMAIN}"
  regional_certificate_arn = data.aws_acm_certificate.existing_certificate.arn

  endpoint_configuration {
    types = ["REGIONAL"]
  }
  #depends_on = [
  #  aws_acm_certificate.cert_us_east_1,
  #  aws_route53_record.route_53_certificate_records_us_east_1,
  #]
  provider = aws.deployment-ap
}

# Adds DNS record of newly created API domain name to Hosted Zone in main acc using Route53.
resource "aws_route53_record" "record_updater" {
  name    = aws_api_gateway_domain_name.dev_api.domain_name
  type    = "A"
  zone_id = data.aws_route53_zone.domain_zone.zone_id
  provider = aws.main
  
  #configures the domain name and Cname which will be added in hosted zone
  alias {
    evaluate_target_health = true
    name                   = aws_api_gateway_domain_name.dev_api.regional_domain_name
    zone_id                = aws_api_gateway_domain_name.dev_api.regional_zone_id
  }
}

#Creates a variabe store in ssm_parameter store
resource "aws_ssm_parameter" "api_gateway_domain_name" {
  name  = "/dev/DOMAIN_NAME"
  type  = "String"
  value = aws_api_gateway_domain_name.dev_api.regional_domain_name
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "api_gateway_certificate" {
  name  = "/dev/DOMAIN_CERTIFICATE"
  type  = "String"
  value = "*.${var.DOMAIN}"
  provider = aws.deployment-ap
}