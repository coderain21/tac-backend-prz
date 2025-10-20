 

#AWS Provider with profile main account
provider "aws" {
  region  = var.REGION
  alias   = "deployment-eu" # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

terraform {
  backend "s3" {
    region       = "eu-west-2"  # Replace with the appropriate AWS region
    encrypt      = true
    use_lockfile = true  # Enable the S3 locking feature
  }
}

locals {
  json_data = jsonencode(jsondecode(file("${path.module}/services.json")))
}


resource "aws_cloudwatch_dashboard" "demo-dashboard" {
  dashboard_name = "Indyauction-Services-Dashboard"
  provider = aws.deployment-eu

  dashboard_body = local.json_data


}




