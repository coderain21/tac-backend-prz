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
}
resource "aws_ssm_parameter" "application_url" {
  name  = "CDN_URL"
  type  = "String"
  value = "https://${data.external.env.result["STAGE"]}-cdn.${data.external.env.result["DOMAIN"]}"
  provider = aws.deployment-ap
}