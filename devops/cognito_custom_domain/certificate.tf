data "external" "env" {
  program = ["../envs.sh"]
}

provider "aws" {
  region = "us-east-1"
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-main"
}

provider "aws" {
  region = "us-east-1"
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${data.external.env.result["STAGE"]}"
}

provider "aws" {
  region = "eu-west-2"
  alias = "deployment-ap"   
  profile = "indyauction-${data.external.env.result["STAGE"]}"
}

provider "aws" {
  region = data.external.env.result["REGION"]
}
data "aws_route53_zone" "domain_zone" {
  name = data.external.env.result["DOMAIN"] # Replace with your domain name
  provider = aws.main
}
locals {
  computed_domain = "${data.external.env.result["STAGE"]}" == "prod" ? "seller" : "${data.external.env.result["STAGE"]}-seller"
}
resource "aws_acm_certificate" "cert_cognito_us_east_1" {
  domain_name ="*.${local.computed_domain}.${data.external.env.result["DOMAIN"]}"
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
  provider = aws.main
}
locals {
 a= "${data.external.env.result["STAGE"] == "dev" ? "www-develop" : ""}"
 b = "${data.external.env.result["STAGE"] == "prod" ? "www" : ""}"
 c = "www-${data.external.env.result["STAGE"]}"
 computed_variable = "${coalesce(local.a,local.b, local.c)}"
}

resource "aws_acm_certificate" "cert_cognito_us_east_2" {
  domain_name ="*.${local.computed_variable}.${data.external.env.result["DOMAIN"]}"
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
  provider = aws.main
}

resource "aws_cognito_user_pool_domain" "seller" {
  domain          = "auth.${local.computed_domain}.${data.external.env.result["DOMAIN"]}"
  certificate_arn = aws_acm_certificate.cert_cognito_us_east_1.arn
  user_pool_id = data.external.env.result["SELLER_COGNITO_USERPOOL_ID"]
  depends_on = [resource.aws_route53_record.route_53_certificate_records_us_east_1]
  provider = aws.deployment-ap
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
  provider = aws.main
}

resource "aws_cognito_user_pool_domain" "buyer" {
  domain          = "auth.${local.computed_variable}.${data.external.env.result["DOMAIN"]}"
  certificate_arn = aws_acm_certificate.cert_cognito_us_east_2.arn
  user_pool_id = data.external.env.result["BUYER_COGNITO_USERPOOL_ID"]
  depends_on = [resource.aws_route53_record.route_53_certificate_records_us_east_2]
  provider = aws.deployment-ap
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
  provider = aws.main
}

resource "aws_ssm_parameter" "seller_cognito_custom_domain" {
  name  = "SELLER_COGNITO_USERPOOL_DOMAIN"
  type  = "String"
  value = "auth.${local.computed_domain}.${data.external.env.result["DOMAIN"]}"
  provider = aws.deployment-ap
  overwrite = true
}

resource "aws_ssm_parameter" "buyer_cognito_custom_domain" {
  name  = "BUYER_COGNITO_USERPOOL_DOMAIN"
  type  = "String"
  value = "auth.${local.computed_variable}.${data.external.env.result["DOMAIN"]}"
  provider = aws.deployment-ap
  overwrite = true
}

output "instance_ip_addr" {
  value = aws_acm_certificate.cert_cognito_us_east_2.arn
}