variable "sub_domain" {
  description = "The subdomain for which to create certificates"
  type        = string
}

variable "zone_id" {
  description = "Route53 zone ID for DNS validation"
  type        = string
}

variable "providers" {
  type = object({
    aws = object({
      deployment-us = any
      deployment-eu = any
      route53-account = any
    })
  })
}

resource "aws_acm_certificate" "cert_us_east_1" {
  domain_name       = "*.${var.sub_domain}"
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
  provider = var.providers.aws.deployment-us
}

resource "aws_acm_certificate" "cert_eu" {
  domain_name       = "*.${var.sub_domain}"
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
  provider = var.providers.aws.deployment-eu
}

resource "aws_route53_record" "cert_validation_us" {
  for_each = {
    for dvo in aws_acm_certificate.cert_us_east_1.domain_validation_options : dvo.domain_name => {
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
  zone_id         = var.zone_id
  provider        = var.providers.aws.route53-account
}

resource "aws_route53_record" "cert_validation_eu" {
  for_each = {
    for dvo in aws_acm_certificate.cert_eu.domain_validation_options : dvo.domain_name => {
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
  zone_id         = var.zone_id
  provider        = var.providers.aws.route53-account
}
