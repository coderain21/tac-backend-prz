 

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

# Get Lambda function ARN from SSM parameter
data "aws_ssm_parameter" "api_5xx_handler_arn" {
  name = "API_5XX_ALERT_HANDLER_ARN"
  provider = aws.deployment-eu
}

# Subscribe Lambda to CloudWatchAlarmTopic
resource "aws_sns_topic_subscription" "lambda_subscription" {
  topic_arn = aws_sns_topic.cloudwatch_alarm_topic.arn
  protocol  = "lambda"
  endpoint  = data.aws_ssm_parameter.api_5xx_handler_arn.value
  provider  = aws.deployment-eu
}

# Allow SNS to invoke Lambda
resource "aws_lambda_permission" "allow_sns_invoke" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = data.aws_ssm_parameter.api_5xx_handler_arn.value
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.cloudwatch_alarm_topic.arn
  provider      = aws.deployment-eu
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

# P1 Critical - Authentication & Registration (Part 1)
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_auth_1" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Auth-1"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Authentication & Registration Part 1"
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
        Resource = "/otp-validation"
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
    id = "subdomain_api"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-subdomain"
        Resource = "/subdomain"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_auth_1"
    expression  = "MAX([buyer_verify_captcha, buyer_otp_validation, buyer_auth_login, seller_verify_captcha, seller_otp_validation, seller_request_otp, buyer_auction_register, buyer_verify_card, subdomain_api])"
    label       = "Max 5XX Errors P1 Auth 1"
    return_data = true
  }
}

# P1 Critical - Authentication & Registration (Part 2)
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_auth_2" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Auth-2"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Authentication & Registration Part 2"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "subdomain_api_patch"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-subdomain"
        Resource = "/subdomain"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "password_update"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/password-update/{email}"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_auth_2"
    expression  = "MAX([subdomain_api_patch, password_update])"
    label       = "Max 5XX Errors P1 Auth 2"
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

# Batch Lots Publish Lambda Error Alarm
resource "aws_cloudwatch_log_metric_filter" "batch_lots_publish_lambda_error_filter" {
  name           = "Batch Lots Publish All Errors"
  log_group_name = "/aws/lambda/auctions-${var.STAGE}-batchLotsPublish"
  pattern        = "ERROR"

  metric_transformation {
    name      = "BatchLotsPublishErrorCount"
    namespace = "BatchLotsPublishError"
    value     = "1"
    default_value = "0"
  }
  provider = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "batch_lots_publish_lambda_error_alarm" {
  alarm_name          = "p1-IndyAuction-${var.STAGE}-Batch-Lots-Publish-Error-Alarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = aws_cloudwatch_log_metric_filter.batch_lots_publish_lambda_error_filter.metric_transformation[0].name
  namespace           = aws_cloudwatch_log_metric_filter.batch_lots_publish_lambda_error_filter.metric_transformation[0].namespace
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Batch Lots Publish Lambda errors >= 1"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  provider            = aws.deployment-eu
}

# Batch Lots Update Lambda Error Alarm
resource "aws_cloudwatch_log_metric_filter" "batch_lots_update_lambda_error_filter" {
  name           = "Batch Lots Update All Errors"
  log_group_name = "/aws/lambda/auctions-${var.STAGE}-batchLotsUpdate"
  pattern        = "ERROR"

  metric_transformation {
    name      = "BatchLotsUpdateErrorCount"
    namespace = "BatchLotsUpdateError"
    value     = "1"
    default_value = "0"
  }
  provider = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "batch_lots_update_lambda_error_alarm" {
  alarm_name          = "p1-IndyAuction-${var.STAGE}-Batch-Lots-Update-Error-Alarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = aws_cloudwatch_log_metric_filter.batch_lots_update_lambda_error_filter.metric_transformation[0].name
  namespace           = aws_cloudwatch_log_metric_filter.batch_lots_update_lambda_error_filter.metric_transformation[0].namespace
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Batch Lots Update Lambda errors >= 1"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  provider            = aws.deployment-eu
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

resource "aws_cloudwatch_log_metric_filter" "throttling_exception_filter" {
  name           = "ThrottlingExceptionFilter"
  log_group_name = "/aws/lambda/auctions-${var.STAGE}-unpublish_auction" # Change this

  pattern = "\"ThrottlingException\""

  metric_transformation {
    name      = "ThrottlingExceptionCount"
    namespace = "LogMetrics"
    value     = "1"
  }
  provider  = aws.deployment-eu

}


resource "aws_cloudwatch_metric_alarm" "throttling_exception_alarm" {
  alarm_name          = "P1-IndyAuction-${var.STAGE}-ThrottlingException-Unpublish-Auction"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = aws_cloudwatch_log_metric_filter.throttling_exception_filter.metric_transformation[0].name
  namespace           = aws_cloudwatch_log_metric_filter.throttling_exception_filter.metric_transformation[0].namespace
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alarm when ThrottlingException appears in logs"
  treat_missing_data  = "notBreaching"
  # Optional: SNS topic for notifications
  alarm_actions = [aws_sns_topic.cloudwatch_alarm_topic.arn] # Define this if needed
  provider  = aws.deployment-eu
}


# ECS ERROR LOG FILTER FOR TypeError
resource "aws_cloudwatch_log_metric_filter" "ecs_type_error_filter" {
  name           = "ECS-TypeError-Filter"
  log_group_name = "/ecs/task"  # ECS log group name

  pattern = "TypeError Cannot read properties of undefined reading url"

  metric_transformation {
    name      = "ECSTypeErrorCount"
    namespace = "ECS/Errors"
    value     = "1"
  }
  provider = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "ecs_type_error_alarm" {
  alarm_name          = "P1-IndyAuction-${var.STAGE}-Redis-Data-Miss-Email-Fails"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = aws_cloudwatch_log_metric_filter.ecs_type_error_filter.metric_transformation[0].name
  namespace           = aws_cloudwatch_log_metric_filter.ecs_type_error_filter.metric_transformation[0].namespace
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert when Redis data is missing or email sending fails"
  treat_missing_data  = "notBreaching"
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

resource "aws_cloudwatch_metric_alarm" "stepfunction_executions_timed_out" {
  alarm_name          = "P2-IndyAuction-${var.STAGE}-StepFunction-ExecutionsTimedOut"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsTimedOut"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  dimensions = {
    StateMachineArn = "arn:aws:states:${var.REGION}:${var.ACCOUNT_ID}:stateMachine:${var.STAGE}-lot-published"
  }
  alarm_description   = "Timed out executions in Step Function"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  provider             = aws.deployment-eu
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
    { look_back_window_minutes = 10 },
    { look_back_window_minutes = 180 },
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
    { look_back_window_minutes = 30 },
    { look_back_window_minutes = 360 },
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
  }



  metric_query {
    id          = "max5xx_p2_part1"
    expression  = "MAX([buyer_update_password, buyer_forgot_password, buyer_reset_password, seller_forgot_password, seller_reset_password, buyer_profile, buyer_address_post])"
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
    expression  = "MAX([seller_clone_auction, seller_buyer_approval, seller_update_lot, seller_delete_lot, seller_import_lots])"
    label       = "Max 5XX Errors P2 Part2"
    return_data = true
  }
}





# P1 Critical - Additional Routes 1
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_additional_1" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Additional-1"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Additional Routes 1"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "auctions_list"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "auctions_delete_note"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "auctions_list_lots"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/lots"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "auctions_admin_list_lots"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/admin/lots"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "auctions_reorder_lots"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/reorder-lots"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "auctions_delete_auction"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/{auction_id}"
        Stage    = var.STAGE
        Method   = "DELETE"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "auctions_deactivate"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/deactivate"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "auctions_leaderboard"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/leaderboard/{auction_id}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_add_1"
    expression  = "MAX([auctions_list, auctions_list_lots, auctions_admin_list_lots, auctions_reorder_lots, auctions_delete_auction, auctions_deactivate, auctions_leaderboard])"
    label       = "Max 5XX Errors P1 Add 1"
    return_data = true
  }
}

# P1 Critical - Additional Routes 2
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_additional_2" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Additional-2"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Additional Routes 2"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "auctions_delete_image"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-auctions"
        Resource = "/image"
        Stage    = var.STAGE
        Method   = "DELETE"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "buyers_create_userpools"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "buyers_add_address"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/add-address"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "buyers_links"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/links"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "buyers_signin_logger"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/buyer-logs"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "buyers_privacy_policy"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-buyers"
        Resource = "/policy/{auction_id}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

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
  }

  metric_query {
    id          = "max5xx_p1_add_2"
    expression  = "MAX([auctions_delete_image, buyers_create_userpools, buyers_add_address, buyers_links, buyers_signin_logger, buyers_privacy_policy, buyer_search_lots, buyer_add_wishlist, buyer_remove_wishlist])"
    label       = "Max 5XX Errors P1 Add 2"
    return_data = true
  }
}

# P1 Critical - Additional Routes 3
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_additional_3" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Additional-3"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Additional Routes 3"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

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
  }


  metric_query {
    id = "address_get"
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
    id = "address_update"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-address-management"
        Resource = "/address"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "bids_list"
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
  }

  metric_query {
    id = "bids_view"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-bids"
        Resource = "/{id}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "bids_admin_view"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-bids"
        Resource = "/admin/{id}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "payments_webhook"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-payments"
        Resource = "/payments_webhook"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "paypal_connect"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-paypal"
        Resource = "/paypal-connect"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_add_3"
    expression  = "MAX([buyer_view_wishlist, address_get, address_update, bids_list, bids_view, bids_admin_view, payments_webhook, paypal_connect])"
    label       = "Max 5XX Errors P1 Add 3"
    return_data = true
  }
}

# P1 Critical - Additional Routes 4
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_additional_4" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Additional-4"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Additional Routes 4"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "paypal_connect_webhook"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-paypal"
        Resource = "/paypal-connect-webhook"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "paypal_disconnect"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-paypal"
        Resource = "/paypal-disconnect"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "paypal_order_webhook"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-paypal"
        Resource = "/paypal-order-webhook"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "users_view_profile"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/{email}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "users_update_profile"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/{email}"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "users_generate_token"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/generate"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }


  metric_query {
    id = "users_update_plan"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/update-plan/{email}"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }


  metric_query {
    id          = "max5xx_p1_add_4"
    expression  = "MAX([paypal_connect_webhook, paypal_disconnect, paypal_order_webhook, users_view_profile, users_update_profile, users_generate_token, users_update_plan])"
    label       = "Max 5XX Errors P1 Add 4"
    return_data = true
  }
}

# P1 Critical - Additional Routes 5
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_additional_5" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Additional-5"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Additional Routes 5"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "users_payment_intent"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/payment-intent"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "users_seller_subdomain"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/seller-sub-domain"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "users_stripe_disconnect"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/stripe"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "users_stripe_connect"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/stripe"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "users_stripe_webhook"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/stripe_webhook_trigger"
        Stage    = var.STAGE
        Method   = "ANY"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "users_get_template"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/get-template/{template_name}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "users_create_template"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-users-management"
        Resource = "/create-template"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_buyer_update"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-buyer-bid-history"
        Resource = "/admin/{buyer_id}"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_buyer_list_bids"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-buyer-bid-history"
        Resource = "/admin/buyer/{email_address}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_add_5"
    expression  = "MAX([users_payment_intent, users_seller_subdomain, users_stripe_disconnect, users_stripe_connect, users_stripe_webhook, users_get_template, users_create_template, admin_buyer_update, admin_buyer_list_bids])"
    label       = "Max 5XX Errors P1 Add 5"
    return_data = true
  }
}

# P1 Critical - Additional Routes 6
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_additional_6" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Additional-6"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Additional Routes 6"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "admin_buyer_list"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-buyer-bid-history"
        Resource = "/list/{seller_email}/{auction_id}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_buyer_bids"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-buyer-bid-history"
        Resource = "/bids"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_buyer_delete"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-buyer-bid-history"
        Resource = "/delete-buyer"
        Stage    = var.STAGE
        Method   = "DELETE"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "seller_bidder_list"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-seller-bidder-management"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "seller_orders"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-seller-bidder-management"
        Resource = "/seller-orders"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "lot_bid_history_list"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-lot-bid-history"
        Resource = "/{lot_id}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "lot_bid_history_buyer"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-lot-bid-history"
        Resource = "/buyer/{lot_id}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "lot_bid_history_auction"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-lot-bid-history"
        Resource = "/auction/{auction_id}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "lot_bid_history_seller_bids"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-lot-bid-history"
        Resource = "/seller/bids"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_add_6"
    expression  = "MAX([admin_buyer_list, admin_buyer_bids, admin_buyer_delete, seller_bidder_list, seller_orders, lot_bid_history_list, lot_bid_history_buyer, lot_bid_history_auction, lot_bid_history_seller_bids])"
    label       = "Max 5XX Errors P1 Add 6"
    return_data = true
  }
}

# P1 Critical - Additional Routes 7
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_additional_7" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Additional-7"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Additional Routes 7"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "orders_list"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-orders"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "orders_details"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-orders"
        Resource = "/details"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "orders_update"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-orders"
        Resource = "/update"
        Stage    = var.STAGE
        Method   = "PUT"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "orders_sales"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-orders"
        Resource = "/sales"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
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
  }

  metric_query {
    id = "site_banner_create"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-site-banner"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "site_banner_list"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-site-banner"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "site_banner_view"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-site-banner"
        Resource = "/{audience}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "site_banner_delete"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-site-banner"
        Resource = "/delete/{notification_id}"
        Stage    = var.STAGE
        Method   = "DELETE"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_add_7"
    expression  = "MAX([orders_list, orders_details, orders_update, orders_sales, seller_export_data, site_banner_create, site_banner_list, site_banner_view, site_banner_delete])"
    label       = "Max 5XX Errors P1 Add 7"
    return_data = true
  }
}

# P1 Critical - Additional Routes 8
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_additional_8" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Additional-8"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Additional Routes 8"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "admin_list_auctions"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/auctions"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_list_buyers"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/buyers"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_buyer_details"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/buyer-details"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_buyer_auctions"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/buyer-auctions"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_purchase_list"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/{id}"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_clone_auction"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/clone-auction"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_order_details"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/order-details"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_auction_purchases"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/auction-purchases"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_auction_details"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/auction-details"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_add_8"
    expression  = "MAX([admin_list_auctions, admin_list_buyers, admin_buyer_details, admin_buyer_auctions, admin_purchase_list, admin_clone_auction, admin_order_details, admin_auction_purchases, admin_auction_details])"
    label       = "Max 5XX Errors P1 Add 8"
    return_data = true
  }
}

# P1 Critical - Additional Routes 9
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_additional_9" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Additional-9"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Additional Routes 9"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "admin_all_purchases"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/accountings"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_seller_view"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/view-seller"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_update_seller_status"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/update-seller-status"
        Stage    = var.STAGE
        Method   = "POST"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_unpublish_auction"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/unpublish-auction"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_bdd_update"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/admin_bdd-update/{auction_id}"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_publish_auction"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/publish-auction/{auction_id}"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_subdomain"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/admin-subdomain"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_update_auction"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/edit-auction/{auction_id}"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_update_lot"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/update-lot"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_add_9"
    expression  = "MAX([admin_all_purchases, admin_seller_view, admin_update_seller_status, admin_unpublish_auction, admin_bdd_update, admin_publish_auction, admin_subdomain, admin_update_auction, admin_update_lot])"
    label       = "Max 5XX Errors P1 Add 9"
    return_data = true
  }
}

# P1 Critical - Additional Routes 10
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_additional_10" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Additional-10"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Additional Routes 10"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  metric_query {
    id = "admin_all_sellers"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/all-sellers"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_update_password"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/admin-update-password"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_enable_disable_seller"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/enable-disable-seller"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "admin_update_seller_settings"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-admin-management"
        Resource = "/update-seller-settings"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "newsletter_patch"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-newsletter"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "PATCH"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_add_10"
    expression  = "MAX([admin_all_sellers, admin_update_password, admin_enable_disable_seller, admin_update_seller_settings, newsletter_patch])"
    label       = "Max 5XX Errors P1 Add 10"
    return_data = true
  }
}

# P1 Critical - Missing Services 1
resource "aws_cloudwatch_metric_alarm" "api_5xx_p1_critical_missing_1" {
  provider            = aws.deployment-eu
  alarm_name          = "p1-critical-IndyAuction-${var.STAGE}-web-ApiGw-5xx-Missing-1"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  alarm_description   = "P1 Critical alarm for 5XX errors - Missing Services 1"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]

  # Quicksight-dashboards service routes (4 routes)
  metric_query {
    id = "quicksight_view"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-quicksight-dashboards"
        Resource = "/"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "quicksight_auction_view"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-quicksight-dashboards"
        Resource = "/auction-view"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "quicksight_admin_view"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-quicksight-dashboards"
        Resource = "/admin-view"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id = "quicksight_admin_auction_view"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-quicksight-dashboards"
        Resource = "/admin-auction-view"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p1_missing_1"
    expression  = "MAX([quicksight_view, quicksight_auction_view, quicksight_admin_view, quicksight_admin_auction_view])"
    label       = "Max 5XX Errors P1 Missing 1"
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
    id = "orders_management_get"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      dimensions = {
        ApiName  = "${var.STAGE}-order-management"
        Resource = "/orders"
        Stage    = var.STAGE
        Method   = "GET"
      }
      period = 300
      stat   = "Sum"
    }
  }

  metric_query {
    id          = "max5xx_p3_part1"
    expression  = "MAX([orders_management_get])"
    label       = "Max 5XX Errors P3 Part1"
    return_data = true
  }
}



# Create CloudWatch Alarms for DocuementDB maximum connections metrics
resource "aws_cloudwatch_metric_alarm" "cloudwatch_documentdb_connections" {
  provider = aws.deployment-eu
  alarm_name     = "P2-IndyAuction-${var.STAGE}-DocumentDB-Max-Connection"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "DatabaseConnectionsMax"
  namespace           = "AWS/DocDB"
  period              = 60  # 1 min (adjust based on your desired granularity)
  statistic           = "Maximum"
  
  # Set your desired reputation threshold (e.g., 70% for db.r6g.xlarge )
  threshold = 1400

  alarm_actions = [aws_sns_topic.cloudwatch_alarm_topic.arn]
   
  dimensions = {
    DBClusterIdentifier = "docdb-mongodb-instance"
  }
}
# Create CloudWatch Alarms for DocuementDB CPU utilization metrics
resource "aws_cloudwatch_metric_alarm" "cloudwatch_documentdb_cpu" {
  provider = aws.deployment-eu
  alarm_name     = "P2-IndyAuction-${var.STAGE}-DocumentDB-CPU"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/DocDB"
  period              = 60  # 1 min (adjust based on your desired granularity)
  statistic           = "Maximum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 70

  alarm_actions = [aws_sns_topic.cloudwatch_alarm_topic.arn]
   
  dimensions = {
    DBClusterIdentifier = "docdb-mongodb-instance"
  }
}

# Create CloudWatch Alarms for DocuementDB Memory utilization metrics
resource "aws_cloudwatch_metric_alarm" "cloudwatch_documentdb_memory" {
  provider = aws.deployment-eu
  alarm_name     = "P2-IndyAuction-${var.STAGE}-DocumentDB-Memory"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeLocalStorage"
  namespace           = "AWS/DocDB"
  period              = 3600  # 1 h (adjust based on your desired granularity)
  statistic           = "Maximum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 3221225472

  alarm_actions = [aws_sns_topic.cloudwatch_alarm_topic.arn]
   
  dimensions = {
    DBClusterIdentifier = "docdb-mongodb-instance"
  }
}


# Create CloudWatch Alarms for Redis  CPU utilization metrics for primary node
resource "aws_cloudwatch_metric_alarm" "cloudwatch_redis_cpu" {
  provider = aws.deployment-eu
  alarm_name     = "P2-IndyAuction-${var.STAGE}-Redis-CPU-Primary"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 300  # 5m (adjust based on your desired granularity)
  statistic           = "Maximum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 70

  alarm_actions = [aws_sns_topic.cloudwatch_alarm_topic.arn]
   
  dimensions = {
    CacheClusterId = "websocket-redis-cluster-enabled-0001-002"
    CacheNodeId = "0001"
  }
}

# Create CloudWatch Alarms for Redis  CPU utilization metrics for replica node
resource "aws_cloudwatch_metric_alarm" "cloudwatch_redis_cpu_node_replica" {
  provider = aws.deployment-eu
  alarm_name     = "P2-IndyAuction-${var.STAGE}-Redis-CPU-Replica"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 300  # 5m (adjust based on your desired granularity)
  statistic           = "Maximum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 70

  alarm_actions = [aws_sns_topic.cloudwatch_alarm_topic.arn]
   
  dimensions = {
    CacheClusterId = "websocket-redis-cluster-enabled-0001-001"
    CacheNodeId = "0001"
  }
}


resource "aws_cloudwatch_metric_alarm" "redis_network_packets_exceeded" {
  provider             = aws.deployment-eu
  alarm_name          = "P2-IndyAuction-${var.STAGE}-Redis-NetworkPacketsAllowanceExceeded"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "NetworkPacketsPerSecondAllowanceExceeded"
  namespace           = "AWS/ElastiCache"
  period              = 300  # 5 minutes
  statistic           = "Maximum"
  threshold           = 0  # Alert when allowance is exceeded
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  
  dimensions = {
    CacheClusterId = "websocket-redis-cluster-enabled-0001-002"
    CacheNodeId = "0001"
  }
}


resource "aws_cloudwatch_metric_alarm" "redis_memory_evictions" {
  provider             = aws.deployment-eu
  alarm_name          = "P2-IndyAuction-${var.STAGE}-Redis-MemoryEvictions"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = 300  # 5 minutes
  statistic           = "Sum"
  threshold           = 1  # Trigger if more than 10 evictions occur
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  
  dimensions = {
    CacheClusterId = "websocket-redis-cluster-enabled-0001-001"
    CacheNodeId    = "0001"
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_memory_usage" {
  provider             = aws.deployment-eu
  alarm_name          = "P2-IndyAuction-${var.STAGE}-Redis-MemoryUsage"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300  # 5 minutes
  statistic           = "Maximum"
  threshold           = 70  # Alert if memory usage exceeds 80%
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  
  dimensions = {
    CacheClusterId = "websocket-redis-cluster-enabled-0001-001"
    CacheNodeId    = "0001"
  }
}
