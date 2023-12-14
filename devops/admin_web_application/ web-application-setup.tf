variable "REGION" {
  description = "AWS region"
  default     = "eu-west-2" # Default region if the environment variable is not set
}

variable "STAGE" {
  description = "AWS Stage"
  default     = "qa" # Default region if the environment variable is not set
}

variable "Application" {
  description = "Application"
  default     = "admin-indyauction-web-application" # Default region if the environment variable is not set
}

variable "DOMAIN" {
  type        = string
  description = "Domain name for ACM certificate"
  default     = "indyauction.net"
}

variable "certificate_domain" {
  type        = string
  description = "Domain name for ACM certificate"
  default     = "*.indyauction.net"
}
provider "aws" {
  region = "us-east-1"
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

provider "aws" {
  region = "us-east-1"
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-main"
}

provider "aws" {
  region = var.REGION
}

resource "aws_s3_bucket" "b" {
  bucket = "${var.Application}-${var.STAGE}"

  tags = {
    Name = "${var.STAGE}"
  }
}

data "aws_acm_certificate" "existing_certificate" {
  domain   = var.certificate_domain
  statuses = ["ISSUED", "PENDING_VALIDATION"] # Specify certificate statuses you want to consider as "existing"
  provider = aws.deployment-us
}

locals {
  certificate_arn = data.aws_acm_certificate.existing_certificate.arn
}

locals {
  s3_origin_id = "myS3Origin"
}

resource "aws_cloudfront_distribution" "s3_distribution" {
  origin {
    domain_name = aws_s3_bucket.b.bucket_regional_domain_name
    origin_id = local.s3_origin_id
  }

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Some comment"
  default_root_object = "index.html"

  aliases = ["${var.STAGE}-admin.${var.DOMAIN}"]

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = local.s3_origin_id

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "allow-all"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  # Custom error response for 403 status code
  custom_error_response {
    error_code             = 403
    response_code          = 200
    response_page_path     = "/index.html"
    error_caching_min_ttl = 10
  }

  tags = {
    Environment = "${var.STAGE}"
  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn = local.certificate_arn
    ssl_support_method = "sni-only"
  }
}

data "aws_route53_zone" "domain_zone" {
  name = var.DOMAIN # Replace with your domain name
  provider = aws.main
}

resource "aws_route53_record" "my_cname" {
  name    = "${var.STAGE}-admin.${var.DOMAIN}" # Replace with your desired CNAME
  type    = "CNAME"
  zone_id = data.aws_route53_zone.domain_zone.zone_id
  records = [aws_cloudfront_distribution.s3_distribution.domain_name]
  provider = aws.main
  ttl     = 300
}

resource "aws_ssm_parameter" "s3_bucket" {
  name  = "ADMIN_S3_BUCKET"
  type  = "String"
  value = "${var.Application}-${var.STAGE}"
  provider = aws.deployment-us
}

resource "aws_ssm_parameter" "distribution_id" {
  name  = "ADMIN_DISTRIBUTION_ID"
  type  = "String"
  value = aws_cloudfront_distribution.s3_distribution.id
  provider = aws.deployment-us
}