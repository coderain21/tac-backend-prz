 

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


# Create an SNS topic for notifications
resource "aws_sns_topic" "cloudwatch_rum_topic" {
  name = "CloudWatchRUMTopic"
  provider = aws.deployment-eu
}

# Create an IAM role for CloudWatch Alarms to use
resource "aws_iam_role" "cloudwatch_rum_role" {
  name = "CloudWatchRUMRole"
  provider = aws.deployment-eu
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action = "sts:AssumeRole",
      Effect = "Allow",
      Principal = {
        Service = "cloudwatch.amazonaws.com"
      }
    }]
  })
}

# Attach the necessary policy to the IAM role
resource "aws_iam_role_policy_attachment" "cloudwatch_rum_policy_attachment" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM"
  role       = aws_iam_role.cloudwatch_rum_role.name
  provider = aws.deployment-eu
}

resource "aws_sns_topic_subscription" "cloudwatch_rum_subscription_1" {
  provider = aws.deployment-eu
  topic_arn = aws_sns_topic.cloudwatch_rum_topic.arn
  protocol  = "email"
  endpoint  = "admin@indy.auction"  # Replace with your email address
}
resource "aws_sns_topic_subscription" "cloudwatch_rum_subscription_3" {
  provider = aws.deployment-eu
  topic_arn = aws_sns_topic.cloudwatch_rum_topic.arn
  protocol  = "email"
  endpoint  = "namratha.shettigar@7edge.com"  # Replace with your email address
}

resource "aws_sns_topic_subscription" "cloudwatch_rum_subscription_2" {
  provider = aws.deployment-eu
  topic_arn = aws_sns_topic.cloudwatch_rum_topic.arn
  protocol  = "email"
  endpoint  = "ranjith.n@7edge.com"  # Replace with your email address
}