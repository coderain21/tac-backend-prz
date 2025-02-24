terraform {
  required_providers {
    stripe = {
      source = "lukasaron/stripe"
      version = "1.9.6"
    }
  }
}
provider "aws" {
  region = "eu-west-2"
  alias = "deployment-eu"   
  profile = "indyauction-${var.STAGE}"
}
provider "stripe" {
  api_key = var.STRIPE_API_KEY
  alias = "stripe-webhook"
}

terraform {
  backend "s3" {
    region       = "eu-west-2"  # Replace with the appropriate AWS region
    encrypt      = true
    use_lockfile = true  # Enable the S3 locking feature
  }
}

data "aws_ssm_parameter" "api_endpoint" {
  name     = "DOMAIN_NAME_FRONT_END"
  provider = aws.deployment-eu
}

resource "stripe_webhook_endpoint" "webhook" {
  url            = "${data.aws_ssm_parameter.api_endpoint.value}/v1/users-management/stripe_webhook_trigger"
  description    = "users stripe webhook"
  enabled_events = [
    "account.updated", 
    "account.application.authorized",
    "account.application.deauthorized",
    "account.external_account.created",
    "account.external_account.deleted",
    "account.external_account.updated"
  ]
  connect = true
  lifecycle {
    ignore_changes = [
      connect# Prevent recreation when storage encryption changes
      # Add more fields if necessary
    ]
  }
  provider =  stripe.stripe-webhook
}
resource "stripe_webhook_endpoint" "payment_webhook" {
  url            = "${data.aws_ssm_parameter.api_endpoint.value}/v1/payments/payments_webhook"
  description    = "payments_webhook stripe webhook"
  enabled_events = [
      "payment_intent.amount_capturable_updated", 
      "payment_intent.canceled",
      "payment_intent.created",
      "payment_intent.partially_funded",
      "payment_intent.payment_failed",
      "payment_intent.processing",
      "payment_intent.requires_action",
      "payment_intent.succeeded"
    ]
  connect  = true
  lifecycle {
    ignore_changes = [
      connect# Prevent recreation when storage encryption changes
      # Add more fields if necessary
    ]
  }
  provider = stripe.stripe-webhook
}


resource "aws_ssm_parameter" "stripe_webhook_secret" {
  name  = "STRIPE_ENDPOINT_SECRET"
  type  = "String"
  value = stripe_webhook_endpoint.payment_webhook.secret
  provider = aws.deployment-eu
  overwrite = true
}
