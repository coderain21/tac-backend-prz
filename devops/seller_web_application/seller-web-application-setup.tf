 


provider "aws" {
  region = var.REGION
  alias = "deployment-eu"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}
provider "aws" {
  region = "us-east-1"
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}-us"
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

resource "aws_s3_bucket" "b" {
  bucket = "indy-auction-seller-web-application-${var.STAGE}"
  force_destroy = true

  tags = {
    Name = "${var.STAGE}"
  }
  provider = aws.deployment-eu
}
resource "aws_s3_bucket_ownership_controls" "s3_bucket_acl_disable" {
  bucket = aws_s3_bucket.b.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
  provider = aws.deployment-eu

  depends_on = [aws_s3_bucket.b]
}


resource "aws_s3_bucket_public_access_block" "s3_bucket_public_access_block" {
  bucket = aws_s3_bucket.b.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
  provider = aws.deployment-eu
}


locals {
  sub_domain = var.STAGE == "prod" ? var.DOMAIN : "${var.STAGE}.${var.DOMAIN}"
}


data "aws_acm_certificate" "existing_certificate" {
  domain   = "*.${local.sub_domain}"
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
  computed_variable = "${var.STAGE}" == "prod" ? "seller.${local.sub_domain}" : "seller.${local.sub_domain}"
}
locals {
  computed_domain_variable = "${var.STAGE}" == "prod" ? "bid" : "www"
}

resource "aws_cloudfront_origin_access_control" "cdn" {
  name                              = "seller-web-application-${var.STAGE}"
  description                       = "seller-web-application-${var.STAGE}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
  provider = aws.deployment-eu
}
# data "aws_ssm_parameter" "waf_web_acl" {
#   name ="WEB_ACL_CLOUDFRONT_ARN"
#   provider = aws.deployment-eu
# }

resource "aws_cloudfront_distribution" "s3_distribution" {
  origin {
    domain_name = aws_s3_bucket.b.bucket_regional_domain_name
    origin_id = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.cdn.id
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

    viewer_protocol_policy = "redirect-to-https"
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
    minimum_protocol_version = "TLSv1.2_2021"  
    cloudfront_default_certificate = false    
  }
  # web_acl_id = var.STAGE == "prod" ? data.aws_ssm_parameter.waf_web_acl.value : null
}

resource "aws_s3_bucket_policy" "allow_access_from_another_account" {
  bucket = aws_s3_bucket.b.id
  policy = data.aws_iam_policy_document.allow_access_from_another_account.json
  provider = aws.deployment-eu
}
data "aws_iam_policy_document" "allow_access_from_another_account" {
  provider = aws.deployment-eu
  statement {
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions = [
      "s3:GetObject",
    ]
    resources = [
      "${aws_s3_bucket.b.arn}/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values = [
        aws_cloudfront_distribution.s3_distribution.arn
      ]
    }
  }
}



data "aws_route53_zone" "domain_zone" {
  name = local.sub_domain # Replace with your domain name
  provider = aws.route53-account
}

resource "aws_route53_record" "my_cname" {
  name    = local.computed_variable # Replace with your desired CNAME
  type    = "CNAME"
  zone_id = data.aws_route53_zone.domain_zone.zone_id
  records = [aws_cloudfront_distribution.s3_distribution.domain_name]
  provider = aws.route53-account
  ttl     = 300
}

resource "aws_ssm_parameter" "s3_bucket" {
  name  = "SELLER_S3_BUCKET"
  type  = "String"
  value = "indy-auction-seller-web-application-${var.STAGE}"
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
  value = local.computed_domain_variable
  provider = aws.deployment-eu
  overwrite = true
}
resource "aws_ssm_parameter" "amplify_domain_name" {
  name  = "AMPLIFY_DOMAIN_NAME"
  type  = "String"
  value = "${local.sub_domain}"
  provider = aws.deployment-eu
  overwrite = true
}
resource "aws_ssm_parameter" "base_url_seller" {
  name  = "BASE_URL_SELLER"
  overwrite = true
  type  = "String"
  value = "https://${local.computed_variable}/"
  provider = aws.deployment-eu
}