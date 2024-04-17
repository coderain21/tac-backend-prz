data "external" "env" {
  program = ["../envs.sh"]
}

#AWS Provider with profile main account
provider "aws" {
  region  = data.external.env.result["REGION"]
  alias   = "deployment-eu" # Specify a default AWS region here
  profile = "indyauction-${data.external.env.result["STAGE"]}"
}

locals {
  json_data = jsonencode(jsondecode(file("${path.module}/services.json")))
}

resource "aws_cloudwatch_dashboard" "demo-dashboard" {
  dashboard_name = "Indyauction-Services-Dashboard"
  provider = aws.deployment-eu

  dashboard_body = local.json_data
}

