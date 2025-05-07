 

provider "aws" {
  region = "us-east-1"
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}-us"
}

provider "aws" {
  region = var.REGION
  alias = "deployment-eu"   
  profile = "indyauction-${var.STAGE}"
}

provider "aws" {
  region = "us-east-1"
  alias = "route53-account"   # Specify a default AWS region here
  profile = "${var.ROUTE53_ACCOUNT}"
}

terraform {
  backend "s3" {
    region       = "eu-west-2"  # Replace with the appropriate AWS region
    encrypt      = true
    use_lockfile = true  # Enable the S3 locking feature
  }
}

locals {
  sub_domain = var.STAGE == "prod" ? var.DOMAIN : "${var.STAGE}.${var.DOMAIN}"
}
data "aws_route53_zone" "domain_zone" {
  name = local.sub_domain # Replace with your domain name
  provider =  aws.route53-account
}

locals {
  computed_domain = "${var.STAGE}" == "prod" ? "seller" : "seller"
}
resource "aws_acm_certificate" "cert_cognito_us_east_1" {
  domain_name ="*.seller.${local.sub_domain}"
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
  provider = aws.deployment-us
}

resource "aws_route53_record" "route_53_certificate_records_us_east_1" {
  for_each = {
    for dvo in aws_acm_certificate.cert_cognito_us_east_1.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.domain_zone.zone_id
  provider = aws.route53-account
}

locals {
  computed_variable = "${var.STAGE}" == "prod" ? "bid" : "www"
}

resource "aws_acm_certificate" "cert_cognito_us_east_2" {
  domain_name ="*.${local.computed_variable}.${local.sub_domain}"
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }

  provider = aws.deployment-us
}

resource "aws_route53_record" "route_53_certificate_records_us_east_2" {
  for_each = {
    for dvo in aws_acm_certificate.cert_cognito_us_east_2.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.domain_zone.zone_id
  provider = aws.route53-account
}
data "aws_ssm_parameter" "seller_cognito_id" {
  name = "SELLER_COGNITO_USERPOOL_ID"
  provider = aws.deployment-eu
}
resource "aws_cognito_user_pool_domain" "seller" {
  domain          = "auth.seller.${local.sub_domain}"
  certificate_arn = aws_acm_certificate.cert_cognito_us_east_1.arn
  user_pool_id = data.aws_ssm_parameter.seller_cognito_id.value
  depends_on = [resource.aws_route53_record.route_53_certificate_records_us_east_1]
  provider = aws.deployment-eu
}
resource "aws_route53_record" "auth_cognito_seller_A" {
  name    = aws_cognito_user_pool_domain.seller.domain
  type    = "A"
  zone_id = data.aws_route53_zone.domain_zone.zone_id
  alias {
    evaluate_target_health = false

    name    = aws_cognito_user_pool_domain.seller.cloudfront_distribution
    zone_id = aws_cognito_user_pool_domain.seller.cloudfront_distribution_zone_id
  }
  provider = aws.route53-account
}

data "aws_ssm_parameter" "buyer_cognito_id" {
  name = "BUYER_COGNITO_USERPOOL_ID"
  provider = aws.deployment-eu
}
resource "aws_cognito_user_pool_domain" "buyer" {
  domain          = "auth.${local.computed_variable}.${local.sub_domain}"
  certificate_arn = aws_acm_certificate.cert_cognito_us_east_2.arn
  user_pool_id = data.aws_ssm_parameter.buyer_cognito_id.value
  depends_on = [resource.aws_route53_record.route_53_certificate_records_us_east_2]
  provider = aws.deployment-eu
}

resource "aws_route53_record" "auth-cognito-buyer-A" {
  name    = aws_cognito_user_pool_domain.buyer.domain
  type    = "A"
  zone_id = data.aws_route53_zone.domain_zone.zone_id
  alias {
    evaluate_target_health = false

    name    = aws_cognito_user_pool_domain.buyer.cloudfront_distribution
    zone_id = aws_cognito_user_pool_domain.buyer.cloudfront_distribution_zone_id
  }
   provider = aws.route53-account
}


output "instance_ip_addr" {
  value = aws_acm_certificate.cert_cognito_us_east_2.arn
}
