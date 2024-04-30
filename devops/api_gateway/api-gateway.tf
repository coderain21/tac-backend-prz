 

  
#AWS Provider with profile main account
provider "aws" {
  region = var.REGION
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}


provider "aws" {
  region = "us-east-1"
  alias = "route53-account"   # Specify a default AWS region here
  profile = "indyauction-${var.ROUTE53_ACCOUNT}"
}

provider "aws" {
  region = var.REGION
  alias = "root-account"   # Specify a default AWS region here
  profile = "indyauction-main"
}

#AWS Provider with profile Stage account
provider "aws" {
  region = var.REGION
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

########
locals {
  sub_domain = var.STAGE == "prod" ? var.DOMAIN : "${var.STAGE}.${var.DOMAIN}"
}

#Fetches the data from Main Domain Hosted Zones
data "aws_route53_zone" "domain_zone" {
  name = local.sub_domain # Replace with your domain name
  provider = aws.route53-account
}

data "aws_acm_certificate" "existing_certificate" {
  domain   = "*.${local.sub_domain}"
  statuses = ["ISSUED", "PENDING_VALIDATION"] # Specify certificate statuses you want to consider as "existing"
  provider = aws.deployment-us
}

#creates a API DOMAIN NAME with ACM certificate generated for regional configuration
resource "aws_api_gateway_domain_name" "dev_api" {
  domain_name              = "apis.${local.sub_domain}"
  regional_certificate_arn = data.aws_acm_certificate.existing_certificate.arn

  endpoint_configuration {
    types = ["REGIONAL"]
  }
  #depends_on = [
  #  aws_acm_certificate.cert_us_east_1,
  #  aws_route53_record.route_53_certificate_records_us_east_1,
  #]
  provider = aws.deployment-us
}

# Adds DNS record of newly created API domain name to Hosted Zone in main acc using Route53.
resource "aws_route53_record" "record_updater" {
  name    = "apis.${local.sub_domain}"
  type    = "A"
  zone_id = data.aws_route53_zone.domain_zone.zone_id
  provider = aws.route53-account
  
  #configures the domain name and Cname which will be added in hosted zone
  alias {
    evaluate_target_health = true
    name                   = aws_api_gateway_domain_name.dev_api.regional_domain_name
    zone_id                = aws_api_gateway_domain_name.dev_api.regional_zone_id
  }
}

#Creates a variabe store in ssm_parameter store
resource "aws_ssm_parameter" "api_gateway_domain_name" {
  name  = "DOMAIN_NAME"
  type  = "String"
  value = "apis.${local.sub_domain}"
  provider = aws.deployment-us
  overwrite = true
}
resource "aws_ssm_parameter" "api_gateway_domain_name_frontend" {
  name  = "DOMAIN_NAME_FRONT_END"
  type  = "String"
  value = "https://apis.${local.sub_domain}"
  provider = aws.deployment-us
  overwrite = true
}
resource "aws_ssm_parameter" "api_gateway_certificate" {
  name  = "DOMAIN_CERTIFICATE"
  type  = "String"
  value = "*.${local.sub_domain}"
  provider = aws.deployment-us
  overwrite = true
}



resource "aws_iam_role" "lambda_exection_main" {
  provider = aws.root-account
  name               = "exection-role-with-asume-${var.STAGE}"
  assume_role_policy = jsonencode({
    "Version" : "2012-10-17",
    "Statement" : [
      {
        "Effect" : "Allow",
        "Principal" : {
          "Service" : "lambda.amazonaws.com"
        },
        "Action" : "sts:AssumeRole"
      },
      {
        "Effect" : "Allow",
        "Principal" : {
          "AWS" : aws_iam_role.lambda_exection.arn
        },
        "Action" : "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_policy" "lambda_assume_role_main" {
  provider = aws.root-account
  name        = "exection-policy-with-asume-${var.STAGE}"
  description = "Example policy with specified permissions"

  policy = jsonencode({
    "Version" : "2012-10-17",
    "Statement" : [
      {
      "Effect": "Allow",
      "Action": [
        "route53:*",
      ],
      "Resource": "*"
    },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attachment_main" {
  provider = aws.root-account
  policy_arn = aws_iam_policy.lambda_assume_role_main.arn
  role       = aws_iam_role.lambda_exection_main.name
}

resource "aws_iam_role" "lambda_exection" {
  provider = aws.main
  name               = "lambda-exection-role-with-asume-${var.STAGE}"
  assume_role_policy = jsonencode({
    "Version" : "2012-10-17",
    "Statement" : [
      {
        "Effect" : "Allow",
        "Principal" : {
          "Service" : "lambda.amazonaws.com"
        },
        "Action" : "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_policy" "lambda_assume_role" {
  provider = aws.main
  name        = "lambda-exection-policy-with-asume-${var.STAGE}"
  description = "Example policy with specified permissions"

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "${aws_iam_role.lambda_exection_main.arn}"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:*",
        "ses:*",
        "s3:*",
        "lambda:*",
        "mobiletargeting:*",
        "dynamodb:*",
        "execute-api:*",
        "amplify:*",
        "route53:*",
        "cognito-identity:UpdateIdentityPool"
      ],
      "Resource": "*"
    }
  ]
}
EOF
}

resource "aws_iam_role_policy_attachment" "attachment" {
  provider = aws.main
  policy_arn = aws_iam_policy.lambda_assume_role.arn
  role       = aws_iam_role.lambda_exection.name
}

resource "aws_ssm_parameter" "lambda_exection_main" {
  name  = "LAMBDA_EXECTION_ARN"
  type  = "String"
  value = aws_iam_role.lambda_exection.arn
  provider = aws.deployment-us
  overwrite = true
}

resource "aws_ssm_parameter" "assume_role_main" {
  name  = "CROSS_ACCOUNT_ARN"
  type  = "String"
  value = aws_iam_role.lambda_exection_main.arn
  provider = aws.deployment-us
  overwrite = true
}

resource "aws_ssm_parameter" "hosted_zone_id" {
  name  = "HOSTED_ZONE_ID"
  type  = "String"
  value = data.aws_route53_zone.domain_zone.zone_id
  provider = aws.deployment-us
  overwrite = true
}