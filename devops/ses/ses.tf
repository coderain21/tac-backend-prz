


#AWS Provider with profile main account
provider "aws" {
  region  = var.REGION
  alias   = "main" # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

#AWS Provider with profile Stage account
provider "aws" {
  region  = var.REGION
  alias   = "deployment-eu" # Specify a default AWS region here
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

resource "aws_ses_domain_identity" "domain_identity" {
  provider = aws.deployment-eu                  # Use the "dev" alias for SES resources
  domain   = local.sub_domain # Replace with your domain
}

data "aws_route53_zone" "hosted_zone" {
  provider = aws.route53-account
  name     = local.sub_domain # Replace with your existing domain
}


#######

resource "aws_ses_domain_dkim" "example" {
  domain   = aws_ses_domain_identity.domain_identity.domain
  provider = aws.deployment-eu
}

resource "aws_route53_record" "dkim_record" {
  count    = 3
  zone_id  = data.aws_route53_zone.hosted_zone.id
  name     = "${aws_ses_domain_dkim.example.dkim_tokens[count.index]}._domainkey"
  type     = "CNAME"
  ttl      = "600"
  provider = aws.route53-account
  records  = ["${aws_ses_domain_dkim.example.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

resource "aws_pinpoint_app" "pinpoint_app" {
  provider = aws.deployment-eu
  name = "indyauction"
}


resource "aws_pinpoint_sms_channel" "sms_channel" {
  provider = aws.deployment-eu
  application_id = aws_pinpoint_app.pinpoint_app.id
  enabled        = true
}

# Enable Email channel
resource "aws_pinpoint_email_channel" "email_channel" {
  provider = aws.deployment-eu
  application_id = aws_pinpoint_app.pinpoint_app.id
  enabled        = true
  from_address = "no-reply@${local.sub_domain}"
  identity     = aws_ses_domain_identity.domain_identity.arn # Replace with SES identity ARN
}

resource "aws_ssm_parameter" "sender_email_address" {
  provider = aws.deployment-eu
  name     = "SENDER_EMAIL_ADDRESS"
  type     = "String"
  value    = "no-reply@${local.sub_domain}"
  overwrite = true
}



resource "aws_ssm_parameter" "pinpoint_app_id" {
  provider = aws.deployment-eu
  name     = "PINPOINT_APPLICATION_ID"
  type     = "String"
  value    = aws_pinpoint_app.pinpoint_app.id
  overwrite = true
}

