data "external" "token" {
  program = ["/bin/bash", "-c", "echo \"{\\\"token\\\":\\\"$(curl -s -X POST -u '${data.external.env.result["BITBUCKET_SECRET]}' https://bitbucket.org/site/oauth2/access_token -d grant_type=client_credentials -d code=420 | jq -r '.access_token')\\\"}\""]
}

 

output "oauth_token" {
  value = data.external.token.result.token
}

provider "aws" {
  region = "eu-central-2"
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
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-main"
}

provider "aws" {
  region = var.REGION
}


resource "aws_amplify_app" "customer_web_application" {
  name       = "customer_web_application"
  repository = ${data.external.env.result["REPOSITORY_URL"]}
  oauth_token = "${data.external.token.result.token}"
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

  environment_variables = {
    test = "test"
  }
}

locals {
  computed_variable = "${var.STAGE}" == "prod" ? "customer" : "${var.STAGE}-customer"
}

output "env_result" {
  value = data.external.env.result
}
resource "aws_amplify_branch" "amplify_branch" {
  app_id      = aws_amplify_app.customer_web_application.id
  branch_name = "${data.external.env.result["BITBUCKET_BRANCH"]}"
  depends_on = [aws_amplify_app.customer_web_application]
  provider = aws.deployment-eu
}

resource "aws_amplify_domain_association" "domain_association" {
  app_id      = aws_amplify_app.customer_web_application.id
  domain_name = var.DOMAIN
  wait_for_verification = false

  
  sub_domain {
    branch_name = aws_amplify_branch.amplify_branch.branch_name
    prefix      = local.computed_variable
  }
  provider = aws.deployment-eu
}

data "aws_route53_zone" "domain_zone" {
  name = var.DOMAIN # Replace with your domain name
  provider = aws.main
}


locals {
  amplify_domain_name = split(" ", join(",", [for sd in aws_amplify_domain_association.domain_association.sub_domain : sd.dns_record if sd.branch_name == "${data.external.env.result["BITBUCKET_BRANCH"]}"]))[2]
}

resource "aws_route53_record" "my_cname" {
  name    = local.computed_variable
  type    = "CNAME"
  zone_id = data.aws_route53_zone.domain_zone.zone_id
  records =  [local.amplify_domain_name]
  provider = aws.main
  ttl     = 300
}

resource "aws_ssm_parameter" "amplify_id" {
  name  = "AMPLIFY_APP_ID"
  overwrite = true
  type  = "String"
  value = data.external.env.result["AMPLIFY_APP_ID"]
  provider = aws.deployment-ap
}