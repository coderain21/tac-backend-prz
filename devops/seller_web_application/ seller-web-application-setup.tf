data "external" "env" {
  program = ["../envs.sh"]
}

variable "certificate_domain" {
  type        = string
  description = "Domain name for ACM certificate"
  default     = "*.indyauction.net"
}
provider "aws" {
  region = "eu-west-2"
  alias = "deployment-eu"   # Specify a default AWS region here
  profile = "indyauction-${data.external.env.result["STAGE"]}"
}
provider "aws" {
  region = "us-east-1"
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${data.external.env.result["STAGE"]}"
}

provider "aws" {
  region = "us-east-1"
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-main"
}

provider "aws" {
  region = data.external.env.result["REGION"]
}

resource "aws_s3_bucket" "b" {
  bucket = "${data.external.env.result["SELLER_APPLICATION"]}-${data.external.env.result["STAGE"]}"

  tags = {
    Name = "${data.external.env.result["STAGE"]}"
  }
}
resource "aws_s3_bucket_ownership_controls" "s3_bucket_acl_enable" {
  bucket = aws_s3_bucket.b.id

  rule {
    object_ownership = "ObjectWriter"
  }
}


resource "aws_s3_bucket_public_access_block" "s3_bucket_public_access_block" {
  bucket = aws_s3_bucket.b.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}


data "aws_acm_certificate" "existing_certificate" {
  domain   = data.external.env.result["CERTIFICATE_DOMAIN"]
  statuses = ["ISSUED"] # Specify certificate statuses you want to consider as "existing"
  provider = aws.deployment-us
}

locals {
  certificate_arn = data.aws_acm_certificate.existing_certificate.arn
}

locals {
  s3_origin_id = "myS3Origin"
}
locals {
  computed_variable = "${data.external.env.result["STAGE"]}" == "prod" ? "seller.${data.external.env.result["DOMAIN"]}" : "${data.external.env.result["STAGE"]}-seller.${data.external.env.result["DOMAIN"]}"
}

resource "aws_cloudfront_distribution" "s3_distribution" {
  origin {
    domain_name = aws_s3_bucket.b.bucket_regional_domain_name
    origin_id = local.s3_origin_id
  }
  provider = aws.deployment-eu
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Some comment"
  default_root_object = "index.html"

  aliases = [local.computed_variable]

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
    Environment = "${data.external.env.result["STAGE"]}"
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
  name = data.external.env.result["DOMAIN"] # Replace with your domain name
  provider = aws.main
}

resource "aws_route53_record" "my_cname" {
  name    = local.computed_variable # Replace with your desired CNAME
  type    = "CNAME"
  zone_id = data.aws_route53_zone.domain_zone.zone_id
  records = [aws_cloudfront_distribution.s3_distribution.domain_name]
  provider = aws.main
  ttl     = 300
}

resource "aws_ssm_parameter" "s3_bucket" {
  name  = "SELLER_S3_BUCKET"
  type  = "String"
  value = "${data.external.env.result["SELLER_APPLICATION"]}-${data.external.env.result["STAGE"]}"
  provider = aws.deployment-eu
  overwrite = true
}

resource "aws_ssm_parameter" "distribution_id" {
  name  = "SELLER_DISTRIBUTION_ID"
  type  = "String"
  value = aws_cloudfront_distribution.s3_distribution.id
  provider = aws.deployment-eu
  overwrite = true
}
resource "aws_ssm_parameter" "application_url" {
  name  = "SELLER_APPLICATION_URL"
  type  = "String"
  value = local.computed_variable
  provider = aws.deployment-eu
  overwrite = true
}
resource "aws_ssm_parameter" "dashboard_application_url" {
  name  = "SELLER_DASHBOARD_APPLICATION_URL"
  type  = "String"
  value = "https://${local.computed_variable}/"
  provider = aws.deployment-eu
  overwrite = true
}
resource "aws_ssm_parameter" "default_subdomain" {
  name  = "DEFAULT_SUB_DOMAIN"
  type  = "String"
  value = "www-${data.external.env.result["STAGE"]}"
  provider = aws.deployment-eu
  overwrite = true
}
resource "aws_ssm_parameter" "static_auction_url" {
  name  = "BUYER_STATIC_AUCTION_URL"
  type  = "String"
  value = "https://www-${local.computed_variable}/"
  provider = aws.deployment-eu
  overwrite = true
}
resource "aws_ssm_parameter" "amplify_domain_name" {
  name  = "AMPLIFY_DOMAIN_NAME"
  type  = "String"
  value = "${data.external.env.result["DOMAIN"]}"
  provider = aws.deployment-eu
  overwrite = true
}