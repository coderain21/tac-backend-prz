#variabe default region
variable "REGION" {
  description = "AWS region"
  default     = "eu-west-2" # Default region if the environment variable is not set
}

#variable default domain name
variable "DOMAIN" {
  description = "Domain"
  default     = "indyauction.net" # Default region if the environment variable is not set
}

#variable default stage
variable "STAGE" {
  description = "AWS Stage"
  default     = "dev" # Default region if the environment variable is not set
}

#AWS Provider with profile main account
provider "aws" {
  region = "eu-west-2"
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-main"
}

#AWS Provider with profile Stage account
provider "aws" {
  region = "eu-west-2"
  alias = "deployment-ap"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

#Default AWS region for variable


variable "certificate_domain" {
  type        = string
  description = "Domain name for ACM certificate"
  default     = "*.indyauction.net"
}

variable "repository" {
  type        = string
  description = "github repo url"
  default     = "https://bitbucket.org/7EDGE/indy-auction-buyer-web-application"
}
variable "app_name" {
  type        = string
  description = "AWS Amplify App Name"
  default     = "indyauction-buyer-application-dev"
}


provider "aws" {
  region = "eu-west-2"
  alias = "deployment-eu"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

provider "aws" {
  region = var.REGION
}

resource "aws_amplify_app" "amplify_app" {
  name       = var.app_name
  repository = var.repository
  oauth_token ="ATCTT3xFfGN0pvXiC2Tqk5pdXZvb_ouRJ1ssNumx81FXBl27enh4NZwOLCwE8N542V1xY81hb_h6mEkZjDdKXywQ5VICnct9KQbHxP2Cu0YJOCJLG2emVWuUeohiEZeAv8Az-0A_tvDB27ibVylu_DmVWLQF4QBkgkb9i6RGPJqeB9YFtxWEUHY=92C7D829"
  provider = aws.deployment-eu
  # The default build_spec added by the Amplify Console for React.
  build_spec = <<-EOT
    version: 0.1
    frontend:
      phases:
        preBuild:
          commands:
            - npm install --f
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
    STAGE = "dev"
  }
}

resource "aws_amplify_branch" "develop" {
  app_id      = aws_amplify_app.amplify_app.id
  branch_name = "deveop"
  framework = "nextjs"
  stage     = "DEVELOPMENT"
  provider = aws.deployment-eu

}
resource "aws_amplify_domain_association" "domain" {
  app_id      = aws_amplify_app.amplify_app.id
  domain_name = "indyauction.net"
  provider = aws.deployment-eu
  # https://example.com
  sub_domain {
    branch_name = aws_amplify_branch.develop.branch_name
    prefix      = "www-dev"
  }
  enable_auto_sub_domain = true
  wait_for_verification  = false
}




