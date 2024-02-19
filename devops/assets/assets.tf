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

resource "aws_acm_certificate" "cert_us_east_1" {
  domain_name ="*.${data.external.env.result["DOMAIN"]}"
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
  provider = aws.deployment-us
}

resource "aws_acm_certificate" "cert_ap_south_1" {
  domain_name ="*.${data.external.env.result["DOMAIN"]}"
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
  provider = aws.deployment-ap
}

data "aws_route53_zone" "domain_zone" {
  name = data.external.env.result["DOMAIN"] # Replace with your domain name
  provider = aws.main
}

resource "aws_route53_record" "route_53_certificate_records_ap_south_1" {
  for_each = {
    for dvo in aws_acm_certificate.cert_ap_south_1.domain_validation_options : dvo.domain_name => {
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

resource "aws_route53_record" "route_53_certificate_records_us_east_1" {
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
  zone_id         = data.aws_route53_zone.domain_zone.zone_id
  provider = aws.main
}

resource "aws_s3_bucket" "assets" {
  bucket = "indyauction-assets-${data.external.env.result["STAGE"]}"
  force_destroy = true

  tags = {
    Name = "${data.external.env.result["STAGE"]}"
  }
  provider = aws.deployment-ap
}
resource "aws_s3_bucket_ownership_controls" "s3_bucket_acl_enable" {
  bucket = aws_s3_bucket.assets.id

  rule {
    object_ownership = "ObjectWriter"
  }
}


resource "aws_s3_bucket_public_access_block" "s3_bucket_public_access_block" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}



resource "aws_s3_bucket_cors_configuration" "enable_cors_assets" {
  bucket = aws_s3_bucket.assets.id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST", "GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
  provider = aws.deployment-ap
}


resource "aws_cloudfront_origin_access_control" "cdn" {
  name                              = "assets-${data.external.env.result["STAGE"]}"
  description                       = "assets-${data.external.env.result["STAGE"]}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
  provider = aws.deployment-ap
}

resource "aws_cloudfront_distribution" "s3_distribution" {
  origin {
    domain_name              = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.cdn.id
    origin_id                = "myS3Origin"
  }
  provider = aws.deployment-ap


  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CDN for application"


  aliases = ["${data.external.env.result["STAGE"]}-cdn.${data.external.env.result["DOMAIN"]}"]

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "myS3Origin"

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

  tags = {
    Environment = "${data.external.env.result["STAGE"]}"
  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }


  viewer_certificate {
    acm_certificate_arn = aws_acm_certificate.cert_us_east_1.arn
    ssl_support_method = "sni-only"
  }



}
resource "aws_s3_bucket_policy" "allow_access_from_another_account" {
  bucket = aws_s3_bucket.assets.id
  policy = data.aws_iam_policy_document.s3_policy.json
  provider = aws.deployment-ap

}


data "aws_iam_policy_document" "s3_policy" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
  }
  provider = aws.deployment-ap

}

resource "aws_route53_record" "assets_cname" {
  name    = "${data.external.env.result["STAGE"]}-cdn.${data.external.env.result["DOMAIN"]}" # Replace with your desired CNAME
  type    = "CNAME"
  zone_id = data.aws_route53_zone.domain_zone.zone_id
  records = [aws_cloudfront_distribution.s3_distribution.domain_name]
  ttl = 300
  provider = aws.main

}

resource "aws_ssm_parameter" "assets_bucket" {
  name  = "BUCKET_NAME"
  type  = "String"
  value = "indyauction-assets-${data.external.env.result["STAGE"]}"
  provider = aws.deployment-ap
  overwrite = true
}
resource "aws_ssm_parameter" "application_url" {
  name  = "CDN_URL"
  type  = "String"
  value = "https://${data.external.env.result["STAGE"]}-cdn.${data.external.env.result["DOMAIN"]}/public/"
  provider = aws.deployment-ap
  overwrite = true
}

resource "aws_ssm_parameter" "base_url_admin" {
  name  = "BASE_URL_ADMIN"
  type  = "String"
  value = data.external.env.result["BASE_URL_ADMIN"]
  provider = aws.deployment-ap
  overwrite = true
}
resource "aws_ssm_parameter" "base_url_seller" {
  name  = "BASE_URL_SELLER"
  overwrite = true
  type  = "String"
  value = data.external.env.result["BASE_URL_SELLER"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "base_url_buyer" {
  name  = "BASE_URL_BUYER"
  overwrite = true
  type  = "String"
  value = data.external.env.result["BASE_URL_BUYER"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "customer_session_token" {
  name  = "CUSTOMER_SESSION_TOKEN_SECRET"
  overwrite = true
  type  = "String"
  value = data.external.env.result["CUSTOMER_SESSION_TOKEN_SECRET"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "recaptch_key" {
  name  = "RECAPTCHA_KEY"
  overwrite = true
  type  = "String"
  value = data.external.env.result["RECAPTCHA_KEY"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "password_secret_key" {
  name  = "PASSWORD_SECRET_KEY"
  overwrite = true
  type  = "String"
  value = data.external.env.result["PASSWORD_SECRET_KEY"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "recpatch_url" {
  name  = "RECAPTCHA_URL"
  overwrite = true
  type  = "String"
  value = data.external.env.result["RECAPTCHA_URL"]
  provider = aws.deployment-ap
}

resource "aws_ssm_parameter" "sumsub_secret_key_webhook" {
  name  = "SUMSUB_SECRET_KEY_WEBHOOK"
  overwrite = true
  type  = "String"
  value = data.external.env.result["SUMSUB_SECRET_KEY_WEBHOOK"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "jwt_secret_key" {
  name  = "JWT_SECRET_KEY"
  overwrite = true
  type  = "String"
  value = data.external.env.result["JWT_SECRET_KEY"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "sumsub_secret_key" {
  name  = "SUMSUB_SECRET_KEY"
  overwrite = true
  type  = "String"
  value = data.external.env.result["SUMSUB_SECRET_KEY"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "sumsub_app_token" {
  name  = "SUMSUB_APP_TOKEN"
  overwrite = true
  type  = "String"
  value = data.external.env.result["SUMSUB_APP_TOKEN"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "level_name" {
  name  = "LEVEL_NAME"
  overwrite = true
  type  = "String"
  value = data.external.env.result["LEVEL_NAME"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "seller_google_password" {
  name  = "SELLER_GOOGLE_PASSWORD"
  overwrite = true
  type  = "String"
  value = data.external.env.result["SELLER_GOOGLE_PASSWORD"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "stage" {
  name  = "STAGE"
  overwrite = true
  type  = "String"
  value = data.external.env.result["STAGE"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "kyb_level_name" {
  name  = "KYB_LEVEL_NAME"
  overwrite = true
  type  = "String"
  value = data.external.env.result["KYB_LEVEL_NAME"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "stripe_api_key" {
  name  = "STRIPE_API_KEY"
  overwrite = true
  type  = "String"
  value = data.external.env.result["STRIPE_API_KEY"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "hosted_zone_id" {
  name  = "YOUR_HOSTED_ZONE_ID"
  overwrite = true
  type  = "String"
  value = data.external.env.result["YOUR_HOSTED_ZONE_ID"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "csv_file" {
  name  = "CSV_FILE"
  overwrite = true
  type  = "String"
  value = data.external.env.result["CSV_FILE"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "encryption_secret_key" {
  name  = "ENCRYPTION_SECRET_KEY"
  overwrite = true
  type  = "String"
  value = data.external.env.result["ENCRYPTION_SECRET_KEY"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "credit_card_stripe_api_key" {
  name  = "CREDIT_CARD_STRIPE_API_KEY"
  overwrite = true
  type  = "String"
  value = data.external.env.result["CREDIT_CARD_STRIPE_API_KEY"]
  provider = aws.deployment-ap
}


resource "aws_ssm_parameter" "amplify_id" {
  name  = "AMPLIFY_APP_ID"
  overwrite = true
  type  = "String"
  value = data.external.env.result["AMPLIFY_APP_ID"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "amplify_branch" {
  name  = "AMPLIFY_BRANCH"
  overwrite = true
  type  = "String"
  value = data.external.env.result["AMPLIFY_BRANCH"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "stripe_endpoint_secret" {
  name  = "STRIPE_ENDPOINT_SECRET"
  overwrite = true
  type  = "String"
  value = data.external.env.result["STRIPE_ENDPOINT_SECRET"]
  provider = aws.deployment-ap
}

resource "aws_ssm_parameter" "buyer_recaptcha_url" {
  name  = "BUYER_RECAPTCHA_URL"
  overwrite = true
  type  = "String"
  value = data.external.env.result["BUYER_RECAPTCHA_URL"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "buyer_recaptcha_key" {
  name  = "BUYER_RECAPTCHA_KEY"
  overwrite = true
  type  = "String"
  value = data.external.env.result["BUYER_RECAPTCHA_KEY"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "facebook_client_id" {
  name  = "FACEBOOK_CLIENT_ID"
  overwrite = true
  type  = "String"
  value = data.external.env.result["FACEBOOK_CLIENT_ID"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "facebook_client_secret" {
  name  = "FACEBOOK_CLIENT_SECRET"
  overwrite = true
  type  = "String"
  value = data.external.env.result["FACEBOOK_CLIENT_SECRET"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "google_client_id" {
  name  = "GOOGLE_CLIENT_ID"
  overwrite = true
  type  = "String"
  value = data.external.env.result["GOOGLE_CLIENT_ID"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "google_client_secret" {
  name  = "GOOGLE_CLIENT_SECRET"
  overwrite = true
  type  = "String"
  value = data.external.env.result["GOOGLE_CLIENT_SECRET"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "sales_csv_file" {
  name  = "SALES_CSV_FILE"
  overwrite = true
  type  = "String"
  value = data.external.env.result["SALES_CSV_FILE"]
  provider = aws.deployment-ap
}

resource "aws_ssm_parameter" "socket_url" {
  name  = "SOCKET_URL"
  overwrite = true
  type  = "String"
  value = data.external.env.result["SOCKET_URL"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "region" {
  name  = "REGION"
  overwrite = true
  type  = "String"
  value = data.external.env.result["REGION"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "sender_email" {
  name  = "SENDER_EMAIL"
  overwrite = true
  type  = "String"
  value = data.external.env.result["SENDER_EMAIL"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "redis_endpoint" {
  name  = "REDIS_ENDPOINT"
  overwrite = true
  type  = "String"
  value = data.external.env.result["REDIS_ENDPOINT"]
  provider = aws.deployment-ap
}
resource "aws_ssm_parameter" "redis_url" {
  name  = "REDIS_URL"
  overwrite = true
  type  = "String"
  value = data.external.env.result["REDIS_URL"]
  provider = aws.deployment-ap
}
