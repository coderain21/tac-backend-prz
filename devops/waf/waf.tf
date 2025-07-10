 provider "aws" {
  region = "us-east-1"
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}-us"
}

provider "aws" {
  region = var.REGION
  alias = "deployment-eu"   
  profile = "indyauction-${var.STAGE}"
}

  
terraform {
  backend "s3" {
    region       = "eu-west-2"  # Replace with the appropriate AWS region
    encrypt      = true
    use_lockfile = true  # Enable the S3 locking feature
  }
}


resource "aws_wafv2_web_acl" "standard_acl_cloudfront" {
  provider = aws.deployment-us
  name        = "waf-web-acl-cloudfront"
  description = "Standard AWS WAF ACL with global best-practice managed rule sets"
  scope       = "CLOUDFRONT" # Change to "REGIONAL" for ALB or API Gateway
  default_action {
    allow {}
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "standardWebACL"
    sampled_requests_enabled   = true
  }

  # Core Protection Rule Set (most important)
  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # Known Bad Inputs Protection
  rule {
    name     = "AWS-AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "KnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  # IP Reputation (Amazon's IP reputation list)
  # rule {
  #   name     = "AWS-AWSManagedRulesAmazonIpReputationList"
  #   priority = 3
  #   override_action {
  #     none {}
  #   }
  #   statement {
  #     managed_rule_group_statement {
  #       name        = "AWSManagedRulesAmazonIpReputationList"
  #       vendor_name = "AWS"
  #     }
  #   }
  #   visibility_config {
  #     cloudwatch_metrics_enabled = true
  #     metric_name                = "AmazonIPReputation"
  #     sampled_requests_enabled   = true
  #   }
  # }

  # # Anonymous IP List
  # rule {
  #   name     = "AWS-AWSManagedRulesAnonymousIpList"
  #   priority = 4
  #   override_action {
  #     none {}
  #   }
  #   statement {
  #     managed_rule_group_statement {
  #       name        = "AWSManagedRulesAnonymousIpList"
  #       vendor_name = "AWS"
  #     }
  #   }
  #   visibility_config {
  #     cloudwatch_metrics_enabled = true
  #     metric_name                = "AnonymousIP"
  #     sampled_requests_enabled   = true
  #   }
  # }

  # SQL Injection Protection
  rule {
    name     = "AWS-AWSManagedRulesSQLiRuleSet"
    priority = 5
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "SQLiRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # Rate Limiting Rule
  rule {
    name     = "RateLimitRule"
    priority = 10
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }
  }
}

resource "aws_wafv2_web_acl" "secure_api_web_acl" {
  name        = "SecureApiWebAcl"
  provider = aws.deployment-eu
  description = "WAF ACL for secure API,Cognito and ALB"
  scope       = "REGIONAL"  # For ALB, API Gateway, or Cognito

  default_action {
    allow {}
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "SecureApiWebAclMetric"
    sampled_requests_enabled   = true
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action {
      none {}
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSet"
      sampled_requests_enabled   = true
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
  }

  # rule {
  #   name     = "AWSManagedRulesAmazonIpReputationList"
  #   priority = 2
  #   override_action {
  #     none {}
  #   }
  #   visibility_config {
  #     cloudwatch_metrics_enabled = true
  #     metric_name                = "AmazonIpReputation"
  #     sampled_requests_enabled   = true
  #   }
  #   statement {
  #     managed_rule_group_statement {
  #       name        = "AWSManagedRulesAmazonIpReputationList"
  #       vendor_name = "AWS"
  #     }
  #   }
  # }

  rule {
    name     = "AWSManagedRulesBotControlRuleSet"
    priority = 3
    override_action {
      none {}
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "BotControl"
      sampled_requests_enabled   = true
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesBotControlRuleSet"
        vendor_name = "AWS"
      }
    }
  }

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 4
    override_action {
      none {}
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "SQLiRuleSet"
      sampled_requests_enabled   = true
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }
  }

  rule {
    name     = "RateLimitRule"
    priority = 5
    action {
      block {}
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
  }
}



resource "aws_ssm_parameter" "secure_api_web_acl_ssm" {
  name        = "SECURE_API_WEB_ACL_ARN"
  type        = "String"
  value       = aws_wafv2_web_acl.secure_api_web_acl.arn
  description = "Secure API Web ACL ARN"
  provider    = aws.deployment-eu
}
resource "aws_ssm_parameter" "standard_acl_cloudfront_ssm" {
  name        = "WEB_ACL_CLOUDFRONT_ARN"
  type        = "String"
  value       = aws_wafv2_web_acl.standard_acl_cloudfront.arn
  description = "Standard ACL CloudFront ARN"
  provider    = aws.deployment-eu
}


resource "aws_cloudwatch_log_group" "waf_secure_api_log_group" {
  name              = "aws-waf-logs-alb-cognito-apigateway"
  retention_in_days = 14
  provider          = aws.deployment-eu
}

resource "aws_wafv2_web_acl_logging_configuration" "secure_api_logging" {
  log_destination_configs = [
    "${aws_cloudwatch_log_group.waf_secure_api_log_group.arn}:*"
  ]
  resource_arn = aws_wafv2_web_acl.secure_api_web_acl.arn
  provider     = aws.deployment-eu
}

resource "aws_cloudwatch_log_group" "waf_cloudfront_log_group" {
  name              = "aws-waf-logs-cloudfront"
  retention_in_days = 14
  provider          = aws.deployment-us
}





resource "aws_cloudwatch_log_resource_policy" "waf_logging_policy" {
  policy_name = "AWSWAFLoggingPolicy"
  provider = aws.deployment-us

  policy_document = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "AWSWAFLoggingPermissions",
        Effect = "Allow",
        Principal = {
          Service = "waf.amazonaws.com"
        },
       Action = [
          "logs:PutLogEvents",
          "logs:CreateLogStream"
        ],
        Resource = "*"
      }
    ]
  })
}

resource "aws_wafv2_web_acl_logging_configuration" "cloudfront_logging" {
  depends_on = [ aws_cloudwatch_log_resource_policy.waf_logging_policy ]
  log_destination_configs = [
    "${aws_cloudwatch_log_group.waf_cloudfront_log_group.arn}:*"
  ]
  resource_arn = aws_wafv2_web_acl.standard_acl_cloudfront.arn
  provider     = aws.deployment-us
}


