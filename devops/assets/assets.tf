provider "aws" {
  region = "us-east-1"
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-main"
}

provider "aws" {
  region = "us-east-1"
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

provider "aws" {
  region = "eu-west-2"
  alias = "deployment-eu"   
  profile = "indyauction-${var.STAGE}"
}

provider "aws" {
  region = "us-east-1"
  alias = "route53-account"   # Specify a default AWS region here
  profile = "${var.ROUTE53_ACCOUNT}"
}

locals {
  sub_domain = var.STAGE == "prod" ? var.DOMAIN : "${var.STAGE}.${var.DOMAIN}"
}
locals {
  computed_variable = "${var.STAGE}" == "prod" ? "bid" : "www"
}

data "aws_route53_zone" "domain_zone" {
  name = var.DOMAIN # Replace with your domain name
  provider = aws.route53-account
}
resource "aws_route53_zone" "dev" {
  count = var.STAGE != "prod" ? 1 : 0
  name = local.sub_domain
  tags = {
    Environment = var.STAGE
  }
  provider =  aws.deployment-us
}

resource "aws_route53_record" "dev-ns" {
  count = var.STAGE != "prod" ? 1 : 0
  zone_id = data.aws_route53_zone.domain_zone.zone_id
  name    = local.sub_domain
  type    = "NS"
  ttl     = "30"
  records = aws_route53_zone.dev.name_servers
  provider =  aws.main
}



locals {
  zone_id = "${var.STAGE}" == "prod" ? data.aws_route53_zone.domain_zone.zone_id : try(aws_route53_zone.dev.zone_id, null)
}


resource "aws_acm_certificate" "cert_us_east_1" {
  domain_name ="*.${local.sub_domain}"
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
  provider = aws.deployment-us
}



resource "aws_acm_certificate" "cert_ap_south_1" {
  domain_name ="*.${local.sub_domain}"
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
  provider = aws.deployment-eu
}



resource "aws_route53_record" "route_53_certificate_records_ap_south_1_dev" {
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
  zone_id         = local.zone_id
  provider = aws.route53-account
}


# resource "aws_route53_record" "route_53_certificate_records_ap_south_1_prod" {
#   count = var.STAGE == "prod" ? length(aws_acm_certificate.cert_ap_south_1.domain_validation_options) : 0
#   name   = aws_acm_certificate.cert_ap_south_1.domain_validation_options[count.index].resource_record_name
#   allow_overwrite = true
#   records         = [aws_acm_certificate.cert_ap_south_1.domain_validation_options[count.index].resource_record_value]
#   ttl             = 60
#   type            = aws_acm_certificate.cert_ap_south_1.domain_validation_options[count.index].resource_record_type
#   zone_id         = local.zone_id
#   provider = aws.main
# }

resource "aws_route53_record" "route_53_certificate_records_us_east_1_dev" {
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
  zone_id         = local.zone_id
  provider = aws.route53-account
}

# resource "aws_route53_record" "route_53_certificate_records_us_east_1_prod" {
#   count = var.STAGE == "prod" ? length(aws_acm_certificate.cert_us_east_1.domain_validation_options) : 0
#   name   = aws_acm_certificate.cert_us_east_1.domain_validation_options[count.index].resource_record_name
#   allow_overwrite = true
#   records         = [aws_acm_certificate.cert_us_east_1.domain_validation_options[count.index].resource_record_value]
#   ttl             = 60
#   type            = aws_acm_certificate.cert_us_east_1.domain_validation_options[count.index].resource_record_type
#   zone_id         = local.zone_id
#   provider = aws.main
# }

resource "aws_s3_bucket" "assets" {
  bucket = "indyauction-assets-${var.STAGE}-v1"
  force_destroy = true

  tags = {
    Name = "${var.STAGE}"
  }
  provider = aws.deployment-eu
}
resource "aws_s3_bucket_ownership_controls" "s3_bucket_acl_enable" {
  bucket = aws_s3_bucket.assets.id

  rule {
    object_ownership = "ObjectWriter"
  }
  provider =  aws.deployment-eu
}


resource "aws_s3_bucket_public_access_block" "s3_bucket_public_access_block" {
  bucket = aws_s3_bucket.assets.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
  provider =  aws.deployment-eu
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
  provider = aws.deployment-eu
}


resource "aws_cloudfront_origin_access_control" "cdn" {
  name                              = "assets-${var.STAGE}"
  description                       = "assets-${var.STAGE}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
  provider = aws.deployment-eu
}

resource "aws_cloudfront_distribution" "s3_distribution" {
  depends_on = [
   aws_acm_certificate.cert_us_east_1,
   aws_route53_record.route_53_certificate_records_us_east_1_dev
  ]
  origin {
    domain_name              = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.cdn.id
    origin_id                = "myS3Origin"
  }
  provider = aws.deployment-eu


  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CDN for application"


  aliases = ["cdn.${local.sub_domain}"]

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
    Environment = "${var.STAGE}"
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
  provider = aws.deployment-eu

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
  provider = aws.deployment-eu

}

resource "aws_route53_record" "assets_cname_dev" {
  name    = "cdn.${local.sub_domain}" # Replace with your desired CNAME
  type    = "CNAME"
  zone_id = local.zone_id
  records = [aws_cloudfront_distribution.s3_distribution.domain_name]
  ttl = 300
  provider = aws.route53-account
}


resource "aws_ssm_parameter" "assets_bucket" {
  name  = "BUCKET_NAME"
  type  = "String"
  value = "indyauction-assets-${var.STAGE}-v1"
  provider = aws.deployment-eu
  overwrite = true
}
resource "aws_ssm_parameter" "application_url" {
  name  = "CDN_URL"
  type  = "String"
  value = <<-EOT
    https://cdn.${local.sub_domain}/public/
  EOT
  provider = aws.deployment-eu
  overwrite = true
}

resource "aws_ssm_parameter" "customer_session_token" {
  name  = "CUSTOMER_SESSION_TOKEN_SECRET"
  overwrite = true
  type  = "String"
  value = var.CUSTOMER_SESSION_TOKEN_SECRET
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "recaptch_key" {
  name  = "RECAPTCHA_KEY"
  overwrite = true
  type  = "String"
  value = var.RECAPTCHA_KEY
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "password_secret_key" {
  name  = "PASSWORD_SECRET_KEY"
  overwrite = true
  type  = "String"
  value = var.PASSWORD_SECRET_KEY
  provider = aws.deployment-eu
}


resource "aws_ssm_parameter" "sumsub_secret_key_webhook" {
  name  = "SUMSUB_SECRET_KEY_WEBHOOK"
  overwrite = true
  type  = "String"
  value = var.SUMSUB_SECRET_KEY_WEBHOOK
  provider = aws.deployment-eu
}

resource "aws_ssm_parameter" "sumsub_secret_key" {
  name  = "SUMSUB_SECRET_KEY"
  overwrite = true
  type  = "String"
  value = var.SUMSUB_SECRET_KEY
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "sumsub_app_token" {
  name  = "SUMSUB_APP_TOKEN"
  overwrite = true
  type  = "String"
  value = var.SUMSUB_APP_TOKEN
  provider = aws.deployment-eu
}


resource "aws_ssm_parameter" "stripe_api_key" {
  name  = "STRIPE_API_KEY"
  overwrite = true
  type  = "String"
  value = var.STRIPE_API_KEY
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "stripe_credit_api_key" {
  name  = "CREDIT_CARD_STRIPE_API_KEY"
  overwrite = true
  type  = "String"
  value = var.CREDIT_CARD_STRIPE_API_KEY
  provider = aws.deployment-eu
}




resource "aws_ssm_parameter" "amplify_branch" {
  name  = "AMPLIFY_BRANCH"
  overwrite = true
  type  = "String"
  value = var.AMPLIFY_BRANCH
  provider = aws.deployment-eu
}


resource "aws_ssm_parameter" "facebook_client_id" {
  name  = "FACEBOOK_CLIENT_ID"
  overwrite = true
  type  = "String"
  value = var.FACEBOOK_CLIENT_ID
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "facebook_client_secret" {
  name  = "FACEBOOK_CLIENT_SECRET"
  overwrite = true
  type  = "String"
  value = var.FACEBOOK_CLIENT_SECRET
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "google_client_id" {
  name  = "GOOGLE_CLIENT_ID"
  overwrite = true
  type  = "String"
  value = var.GOOGLE_CLIENT_ID
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "google_client_secret" {
  name  = "GOOGLE_CLIENT_SECRET"
  overwrite = true
  type  = "String"
  value = var.GOOGLE_CLIENT_SECRET
  provider = aws.deployment-eu
}

# resource "aws_ssm_parameter" "bitbucket_secret" {
#   name  = "BITBUCKET_SECRET"
#   type  = "String"
#   value = "NULL"
#   overwrite = true
#   provider = aws.deployment-eu
# }
resource "aws_ssm_parameter" "sitekey" {
  name  = "SITEKEY"
  type  = "String"
  value = var.SITEKEY
  overwrite = true
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "stripe_key" {
  name  = "STRIPE_KEY"
  type  = "String"
  value = var.STRIPE_KEY
  overwrite = true
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "google_api_key" {
  name  = "GOOGLE_API_KEY"
  type  = "String"
  value = var.GOOGLE_API_KEY
  overwrite = true
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "admin_user_authentication_type" {
  name  = "ADMIN_USER_AUTHENTICATION_TYPE"
  type  = "String"
  value = "AMAZON_COGNITO_USER_POOLS"
  overwrite = true
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "location_api" {
  name  = "LOCATION_API"
  type  = "String"
  value = var.LOCATION_API
  overwrite = true
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "stage" {
  name  = "STAGE"
  type  = "String"
  value = var.STAGE
  overwrite = true
  provider = aws.deployment-eu
}

resource "aws_ssm_parameter" "region" {
  name  = "REGION"
  type  = "String"
  value = "eu-west-2"
  overwrite = true
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "web_push_secret_key" {
  name  = "WEB_PUSH_SECRET_KEY"
  type  = "String"
  value = var.WEB_PUSH_SECRET_KEY
  overwrite = true
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "stripe_payment_key" {
  name  = "STRIPE_PAYMENT_KEY"
  type  = "String"
  value = var.STRIPE_PAYMENT_KEY
  overwrite = true
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "buyyer_domain" {
  name  = "BASE_URL_BUYER"
  type  = "String"
  value = "https://${local.computed_variable}.${local.sub_domain}"
  provider = aws.deployment-eu
  overwrite = true
}
resource "aws_ssm_parameter" "seller_cognito_custom_domain" {
  name  = "SELLER_COGNITO_USERPOOL_DOMAIN"
  type  = "String"
  value = "auth.seller.${local.sub_domain}"
  provider = aws.deployment-eu
  overwrite = true
}

resource "aws_ssm_parameter" "buyer_cognito_custom_domain" {
  name  = "BUYER_COGNITO_USERPOOL_DOMAIN"
  type  = "String"
  value = "auth.${local.computed_variable}.${local.sub_domain}"
  provider = aws.deployment-eu
  overwrite = true
}
resource "aws_ssm_parameter" "mailchimp_secret_key" {
  name  = "MAILCHIMP_SECRET_KEY"
  type  = "String"
  value = var.MAILCHIMP_SECRET_KEY
  provider = aws.deployment-eu
  overwrite = true
}

