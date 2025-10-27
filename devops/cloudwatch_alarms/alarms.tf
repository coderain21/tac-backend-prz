 

#AWS Provider with profile main account
provider "awscc" {
  region  = "eu-west-2" # Set region based on your main.tf
  profile = "indyauction-${var.STAGE}" # Use the same profile as your aws provider
  alias   = "deployment-eu-cc" # Optional: Alias if needed, aligns with aws provider alias convention
}
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



# Reference existing SNS topic for notifications
resource "aws_sns_topic" "cloudwatch_alarm_topic" {
  name = "CloudWatchAlarmTopic"
  provider = aws.deployment-eu
}

# Create an IAM role for CloudWatch Alarms to use
resource "aws_iam_role" "cloudwatch_alarm_role" {
  name = "CloudWatchAlarmRole"
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
  role       = aws_iam_role.cloudwatch_alarm_role.name
  provider = aws.deployment-eu
}

# P1 Critical - Authentication & Registration
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_auth" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Auth"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Authentication & Registration"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "buyer_verify_captcha"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "buyers/verify-captcha"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "buyer_otp_validation"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "buyers/otp-validation"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "buyer_auth_login"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/auth/login"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "seller_verify_captcha"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/verify-captcha"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "seller_otp_validation"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/otp-validation"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "seller_request_otp"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/request-otp"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "buyer_auction_register"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/auction-register"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "buyer_verify_card"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/verify-card"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_part1"
    expression  = "MAX([buyer_verify_captcha, buyer_otp_validation, buyer_auth_login, seller_verify_captcha, seller_otp_validation, seller_request_otp, buyer_auction_register, buyer_verify_card])"
    label       = "Max 5XX Errors P1 Part1"
    return_data = true
  }
}

# P1 Critical - Bidding & Payments
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_payments" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Payments"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Bidding & Payments"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "buyer_bids_update"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-bids"
        Resource = "/update"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "stripe_checkout"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-payments"
        Resource = "/stripe"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "paypal_order"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-paypal"
        Resource = "/paypal-order"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "paypal_capture"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-paypal"
        Resource = "/capture-order"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "cart_management"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-cart-management"
        Resource = "/cart"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_create_auction"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_create_lot"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/lots"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_publish_auction"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/update/{auction_id}"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_part2"
    expression  = "MAX([buyer_bids_update, stripe_checkout, paypal_order, paypal_capture, cart_management, seller_create_auction, seller_create_lot, seller_publish_auction])"
    label       = "Max 5XX Errors P1 Part2"
    return_data = true
  }
}

# P1 Critical - Viewing & Management
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_viewing" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Viewing"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Viewing & Management"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "buyer_view"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/view"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "buyer_view_lots"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/view-lots"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "buyer_lot_details"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/lot-details"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "buyer_paddle"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/paddle"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_auctions_view"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/view"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_unpublish_auction"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/{auction_id}"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_part3"
    expression  = "MAX([buyer_view, buyer_view_lots, buyer_lot_details, buyer_paddle, seller_auctions_view, seller_unpublish_auction])"
    label       = "Max 5XX Errors P1 Part3"
    return_data = true
  }
}


# Create CloudWatch Log Metric Filter
resource "aws_cloudwatch_log_metric_filter" "process_cart_lambda_error_alarm" {
  name           = "Process Cart All Errors"
  log_group_name = "/aws/lambda/auctions-${var.STAGE}-process-cart"
  pattern        = "[timestamp, requestId, level=\"ERROR\", message=\"*TypeError*\" || message=\"*Cannot read properties*\" || message=\"*ClusterAllFailedError*\" || message=\"*Redis*\" || message=\"*ECONNREFUSED*\" || message=\"*ETIMEDOUT*\" || message=\"*undefined*\"]"
  provider             = aws.deployment-eu
  metric_transformation {
    name      = "ProcessCartErrorCount"
    namespace = "ProcessCartError"
    value     = "1"
    default_value = "0"
  }
}

# Create CloudWatch Alarm for process cart logs
resource "aws_cloudwatch_metric_alarm" "process_cart_lambda_error_alarm" {
  alarm_name          = "p1-IndyAuction-${var.STAGE}-Process Cart Logs Error Alarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = aws_cloudwatch_log_metric_filter.process_cart_lambda_error_alarm.metric_transformation[0].name
  namespace           = aws_cloudwatch_log_metric_filter.process_cart_lambda_error_alarm.metric_transformation[0].namespace
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alarm when Lambda logs contain 'error'"

  # Actions
  alarm_actions = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  provider             = aws.deployment-eu
}


resource "aws_cloudwatch_log_metric_filter" "save_to_cache_lambda_error_metric_filter" {
  name           = "Save To Cache All Errors"
  log_group_name = "/aws/lambda/auctions-${var.STAGE}-save-to-cache"
  pattern        = "[timestamp, requestId, level=\"ERROR\", message=\"*ClusterAllFailedError*\" || message=\"*Failed to refresh slots cache*\" || message=\"*Redis connection*\" || message=\"*ECONNREFUSED*\" || message=\"*ETIMEDOUT*\" || message=\"*Cannot read properties*\"]"

  metric_transformation {
    name      = "SaveToCacheErrorCount"
    namespace = "SaveToCacheError"
    value     = "1"
    default_value = "0"
  }
  provider             = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "save_to_cache_lambda_error_alarm" {
  alarm_name          = "p1-IndyAuction-${var.STAGE}-Save-To-Cache-Logs-Error-Alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  metric_name         = aws_cloudwatch_log_metric_filter.save_to_cache_lambda_error_metric_filter.metric_transformation[0].name
  namespace           = aws_cloudwatch_log_metric_filter.save_to_cache_lambda_error_metric_filter.metric_transformation[0].namespace
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Save-to-cache Redis errors > 5 in 5 minutes (2 out of 3 periods)"
  treat_missing_data  = "notBreaching"
  alarm_actions = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  provider             = aws.deployment-eu
}








# Other service alarms
resource "aws_cloudwatch_metric_alarm" "lambda_throttles_p1" {
  alarm_name          = "p1-IndyAuction-${var.STAGE}-Lambda-AllFunctions-Throttles"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 900
  alarm_description   = "P1 Total Lambda throttles across all functions > 900"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  provider            = aws.deployment-eu
}



resource "aws_cloudwatch_metric_alarm" "ecs_task_launch_failures_p1" {
  alarm_name          = "p1-IndyAuction-${var.STAGE}-ECS-TaskLaunchFailures"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "TaskLaunchFailures"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  dimensions = {
    ClusterName = "websocket-cluster"
    ServiceName = "websocket-ecs-service"
  }
  alarm_description   = "P1 ECS task launch failures > 1"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  provider            = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "ecs_task_count_p1" {
  alarm_name          = "p1-IndyAuction-${var.STAGE}-ECS-TaskCountExceeded"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "RunningTaskCount"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  dimensions = {
    ClusterName = "websocket-cluster"
    ServiceName = "websocket-ecs-service"
  }
  alarm_description   = "P1 ECS running task count < 1"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  provider            = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "stepfunction_executions_failed_p1" {
  alarm_name          = "p1-IndyAuction-${var.STAGE}-StepFunction-ExecutionsFailed"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsFailed"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  dimensions = {
    StateMachineArn = "arn:aws:states:${var.REGION}:${var.ACCOUNT_ID}:stateMachine:${var.STAGE}-lot-published"
  }
  alarm_description   = "P1 Failed executions in Step Function"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  provider            = aws.deployment-eu
}

# SNS subscriptions are managed outside Terraform

# === SLO Configurations ===

# P1 Critical - System Availability (>= 99.9%)
resource "awscc_applicationsignals_service_level_objective" "p1_critical_availability" {
  provider    = awscc.deployment-eu-cc
  name        = "IndyAuction-${var.STAGE}-P1-Critical-Availability-999pc-7d"
  description = "P1 Critical: API Gateway 5xx Error Rate <= 0.1% (>= 99.9% Availability), measured over rolling 7 days."

  sli = {
    comparison_operator = "LessThanOrEqualTo"
    metric_threshold    = 0.001

    sli_metric = {
      metric_data_queries = [
        { id = "errorRate", expression = "FILL(m5xx, 0) / FILL(mTotal, 1)", return_data = true, label = "P1Critical5xxErrorRate" },
        { id = "m5xx", metric_stat = { metric = { namespace = "AWS/ApiGateway", metric_name = "5XXError", dimensions = [{ name = "Stage", value = var.STAGE }] }, period = 300, stat = "Sum" }, return_data = false },
        { id = "mTotal", metric_stat = { metric = { namespace = "AWS/ApiGateway", metric_name = "Count", dimensions = [{ name = "Stage", value = var.STAGE }] }, period = 300, stat = "Sum" }, return_data = false }
      ]
    }
  }

  goal = {
    attainment_goal = 99.9
    interval        = { rolling_interval = { duration = 7, duration_unit = "DAY" } }
  }
  burn_rate_configurations = [
    { look_back_window_minutes = 60 },
    { look_back_window_minutes = 360 },
  ]
  tags = [{ key = "Priority", value = "P1" }, { key = "SLOType", value = "Availability" }, { key = "Stage", value = var.STAGE }]
}

# P2 Medium - System Availability (>= 99.5%)
resource "awscc_applicationsignals_service_level_objective" "p2_medium_availability" {
  provider    = awscc.deployment-eu-cc
  name        = "IndyAuction-${var.STAGE}-P2-Medium-Availability-995pc-7d"
  description = "P2 Medium: API Gateway 5xx Error Rate <= 0.5% (>= 99.5% Availability), measured over rolling 7 days."

  sli = {
    comparison_operator = "LessThanOrEqualTo"
    metric_threshold    = 0.005

    sli_metric = {
      metric_data_queries = [
        { id = "errorRate", expression = "FILL(m5xx, 0) / FILL(mTotal, 1)", return_data = true, label = "P2Medium5xxErrorRate" },
        { id = "m5xx", metric_stat = { metric = { namespace = "AWS/ApiGateway", metric_name = "5XXError", dimensions = [{ name = "Stage", value = var.STAGE }] }, period = 300, stat = "Sum" }, return_data = false },
        { id = "mTotal", metric_stat = { metric = { namespace = "AWS/ApiGateway", metric_name = "Count", dimensions = [{ name = "Stage", value = var.STAGE }] }, period = 300, stat = "Sum" }, return_data = false }
      ]
    }
  }

  goal = {
    attainment_goal = 99.5
    interval        = { rolling_interval = { duration = 7, duration_unit = "DAY" } }
  }
  burn_rate_configurations = [
    { look_back_window_minutes = 180 },
    { look_back_window_minutes = 720 },
  ]
  tags = [{ key = "Priority", value = "P2" }, { key = "SLOType", value = "Availability" }, { key = "Stage", value = var.STAGE }]
}

# P3 Low - System Availability (>= 99.0%)
resource "awscc_applicationsignals_service_level_objective" "p3_low_availability" {
  provider    = awscc.deployment-eu-cc
  name        = "IndyAuction-${var.STAGE}-P3-Low-Availability-99pc-7d"
  description = "P3 Low: API Gateway 5xx Error Rate <= 1% (>= 99% Availability), measured over rolling 7 days."

  sli = {
    comparison_operator = "LessThanOrEqualTo"
    metric_threshold    = 0.01

    sli_metric = {
      metric_data_queries = [
        { id = "errorRate", expression = "FILL(m5xx, 0) / FILL(mTotal, 1)", return_data = true, label = "P3Low5xxErrorRate" },
        { id = "m5xx", metric_stat = { metric = { namespace = "AWS/ApiGateway", metric_name = "5XXError", dimensions = [{ name = "Stage", value = var.STAGE }] }, period = 300, stat = "Sum" }, return_data = false },
        { id = "mTotal", metric_stat = { metric = { namespace = "AWS/ApiGateway", metric_name = "Count", dimensions = [{ name = "Stage", value = var.STAGE }] }, period = 300, stat = "Sum" }, return_data = false }
      ]
    }
  }

  goal = {
    attainment_goal = 99.0
    interval        = { rolling_interval = { duration = 7, duration_unit = "DAY" } }
  }
  burn_rate_configurations = [
    { look_back_window_minutes = 360 },
    { look_back_window_minutes = 1440 },
  ]
  tags = [{ key = "Priority", value = "P3" }, { key = "SLOType", value = "Availability" }, { key = "Stage", value = var.STAGE }]
}

# API Latency SLO - P90 <= 3 seconds
resource "awscc_applicationsignals_service_level_objective" "api_latency" {
  provider    = awscc.deployment-eu-cc
  name        = "IndyAuction-${var.STAGE}-APIGateway-Latency-P90-Under3s-7d"
  description = "API Gateway p90 latency <= 3000ms. Goal: 99.9% intervals ok over 7d."

  sli = {
    comparison_operator = "LessThanOrEqualTo"
    metric_threshold    = 3000
    sli_metric = {
      metric_data_queries = [{
        id = "apip90latency"
        metric_stat = {
          metric = {
            namespace   = "AWS/ApiGateway"
            metric_name = "Latency"
            dimensions  = [{ name = "Stage", value = var.STAGE }]
          }
          period = 300
          stat   = "p90"
        }
        return_data = true
      }]
    }
  }
  goal = {
    attainment_goal = 99.9
    interval        = { rolling_interval = { duration = 7, duration_unit = "DAY" } }
  }
  burn_rate_configurations = [
    { look_back_window_minutes = 180 },
    { look_back_window_minutes = 1440 },
  ]
  tags = [{ key = "Application", value = "APIGateway" }, { key = "SLOType", value = "Latency" }, { key = "Stage", value = var.STAGE }]
}

# P2 Medium - Part 1 (Password & Profile Management)
resource "aws_cloudwatch_metric_alarm" "api_5xx_p2_medium_profile" {
  provider            = aws.deployment-eu
  alarm_name          = "p2-medium-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Profile"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 5
  alarm_description   = "P2 Medium alarm for 5XX errors - Password & Profile Management"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "buyer_update_password"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/update-password"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "buyer_forgot_password"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/forgot_password"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "buyer_reset_password"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/reset_password"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_forgot_password"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/forgot_password"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_reset_password"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/reset_password"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "buyer_profile"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/profile"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "buyer_address_post"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-address-management"
        Resource = "/address"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "buyer_address_get"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-address-management"
        Resource = "/address"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p2_part1"
    expression  = "MAX([buyer_update_password, buyer_forgot_password, buyer_reset_password, seller_forgot_password, seller_reset_password, buyer_profile, buyer_address_post, buyer_address_get])"
    label       = "Max 5XX Errors P2 Part1"
    return_data = true
  }
}

# P2 Medium - Part 2 (Auction Management)
resource "aws_cloudwatch_metric_alarm" "api_5xx_p2_medium_management" {
  provider            = aws.deployment-eu
  alarm_name          = "p2-medium-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Management"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 5
  alarm_description   = "P2 Medium alarm for 5XX errors - Auction Management"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "seller_clone_auction"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/clone"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_view_bidders"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-bids"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_buyer_approval"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/approval"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_update_lot"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/lots"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_delete_lot"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/lots"
        Stage    = var.STAGE
        Method   = "DELETE"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_import_lots"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/import"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p2_part2"
    expression  = "MAX([seller_clone_auction, seller_view_bidders, seller_buyer_approval, seller_update_lot, seller_delete_lot, seller_import_lots])"
    label       = "Max 5XX Errors P2 Part2"
    return_data = true
  }
}

# P3 Low - Part 1 (Search & Wishlist)
resource "aws_cloudwatch_metric_alarm" "api_5xx_p3_low_search" {
  provider            = aws.deployment-eu
  alarm_name          = "p3-low-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Search"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 5
  alarm_description   = "P3 Low alarm for 5XX errors - Search & Wishlist"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "buyer_search_lots"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/search-lots"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "buyer_add_wishlist"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyer-wishlist"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "buyer_remove_wishlist"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyer-wishlist"
        Resource = "/remove"
        Stage    = var.STAGE
        Method   = "DELETE"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "buyer_view_wishlist"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyer-wishlist"
        Resource = "/wishlist"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_export_data"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-orders"
        Resource = "/seller"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
    return_data = true
  }

  metric_query {
    id = "seller_newsletter_get"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-newsletter"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p3_part1"
    expression  = "MAX([buyer_search_lots, buyer_add_wishlist, buyer_remove_wishlist, buyer_view_wishlist, seller_export_data, seller_newsletter_get])"
    label       = "Max 5XX Errors P3 Part1"
    return_data = true
  }
}