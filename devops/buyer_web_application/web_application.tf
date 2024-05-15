data "external" "env" {
  program = ["./envs.sh"]
}
provider "aws" {
  region = var.REGION
  alias = "deployment-eu"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}
provider "aws" {
  region = "us-east-1"
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

provider "aws" {
  region = "us-east-1"
  alias = "route53-account"   # Specify a default AWS region here
  profile = "${var.ROUTE53_ACCOUNT}"
}

provider "aws" {
  region = "us-east-1"
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

data "external" "token" {
  program = ["bash", "-c", "echo \"{\\\"token\\\":\\\"$(curl -s -X POST -u '${var.BITBUCKET_SECRET}' https://bitbucket.org/site/oauth2/access_token -d grant_type=client_credentials -d code=420 | jq -r '.access_token')\\\"}\""]
}


data "aws_ssm_parameter" "bitbucket" {
  name = "BITBUCKET_SECRET"
  provider = aws.deployment-eu
}

locals {
  ssm_value = try(data.aws_ssm_parameter.bitbucket.value)
  external_token = data.external.token.result.token
  token = local.ssm_value == "NULL" ? local.external_token : local.ssm_value
  subdomains_json = jsondecode(file("subdomains.json"))
}


resource "aws_ssm_parameter" "bitbucket_secret" {
  name  = "BITBUCKET_SECRET"
  type  = "String"
  value = local.token
  provider = aws.deployment-eu
  overwrite = true
}

locals {
  environment_variables = {
    for key, value in data.external.env.result : key => value
  }
}

resource "aws_amplify_app" "customer_web_application" {
  name       = "buyer_web_application"
  repository = var.REPOSITORY_URL
  oauth_token = "${local.token}"
  platform = "WEB_COMPUTE"
  # The default build_spec added by the Amplify Console for React.
  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - npm i --f
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*

  EOT

  # The default rewrites and redirects added by the Amplify Console.
  custom_rule {
    source = "/<*>"
    status = "404"
    target = "/index.html"
  }

  environment_variables = local.environment_variables
  provider = aws.deployment-eu
}

locals {
  sub_domain = var.STAGE == "prod" ? var.DOMAIN : "${var.STAGE}.${var.DOMAIN}"
}

locals {
  computed_variable = "${var.STAGE}" == "prod" ? "bid" : "www"
}

# data "file" "subdomains" {
#   filename = "subdomains.json"
# }

# variable "subdomain_list" {
#   type = list(string)
#   default = jsondecode(data.file.subdomains.content).subdomains
# }

#Fetches the data from Main Domain Hosted Zones
# data "aws_route53_zone" "domain_zone" {
#   name = local.sub_domain # Replace with your domain name
#   provider = aws.main
# }

resource "aws_amplify_branch" "amplify_branch" {
  app_id      = aws_amplify_app.customer_web_application.id
  branch_name = "${var.BITBUCKET_BRANCH}"
  depends_on = [aws_amplify_app.customer_web_application]
  provider = aws.deployment-eu
}


resource "aws_amplify_domain_association" "domain_association" {
  app_id      = aws_amplify_app.customer_web_application.id
  domain_name = local.sub_domain
  wait_for_verification = true
  sub_domain {
    branch_name = aws_amplify_branch.amplify_branch.branch_name
    prefix      = local.computed_variable
  }
  provider = aws.deployment-eu
}

resource "aws_ssm_parameter" "amplify_id" {
  name  = "AMPLIFY_APP_ID"
  overwrite = true
  type  = "String"
  value = aws_amplify_app.customer_web_application.id
  provider = aws.deployment-eu
}

# resource "aws_route53_record" "record_updater" {
#   name    = "www.${local.sub_domain}"
#   type    = "CNAME"
#   zone_id = data.aws_route53_zone.domain_zone.zone_id
#   provider = aws.main
#   records = [aws_amplify_domain_association.domain_association.dns_record]
  
# }

# resource "aws_route53_record" "record_updater_certificate" {
#   name    = aws_amplify_domain_association.domain_association.certificate_verification_dns_record
#   type    = "CNAME"
#   zone_id = data.aws_route53_zone.domain_zone.zone_id
#   provider = aws.main
#   records = [aws_amplify_domain_association.domain_association.certificate_verification_dns_record]
# }


output "name"{
  value=nonsensitive(local.token)
}

output "external_token"{
  value=nonsensitive(local.external_token)
}