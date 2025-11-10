 

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

# P1 Critical - System Availability (>= 99.9%) - Service Specific
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
        { id = "m5xx", metric_stat = { metric = { namespace = "AWS/ApiGateway", metric_name = "5XXError" }, period = 300, stat = "Sum" }, return_data = false },
        { id = "mTotal", metric_stat = { metric = { namespace = "AWS/ApiGateway", metric_name = "Count" }, period = 300, stat = "Sum" }, return_data = false }
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

# P2 Medium - System Availability (>= 99.5%) - Service Specific
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
        { id = "m5xx", metric_stat = { metric = { namespace = "AWS/ApiGateway", metric_name = "5XXError" }, period = 300, stat = "Sum" }, return_data = false },
        { id = "mTotal", metric_stat = { metric = { namespace = "AWS/ApiGateway", metric_name = "Count" }, period = 300, stat = "Sum" }, return_data = false }
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

# P3 Low - System Availability (>= 99.0%) - Service Specific
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
        { id = "m5xx", metric_stat = { metric = { namespace = "AWS/ApiGateway", metric_name = "5XXError" }, period = 300, stat = "Sum" }, return_data = false },
        { id = "mTotal", metric_stat = { metric = { namespace = "AWS/ApiGateway", metric_name = "Count" }, period = 300, stat = "Sum" }, return_data = false }
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

# API Latency SLO - P90 <= 3 seconds - Service Specific
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



locals {
  # ALL 124 routes extracted from your current alarms.tf
  all_routes = [
    # P1 Critical - Authentication & Registration
    { service = "buyers", resource = "/verify-captcha", method = "POST", priority = "P1" },
    { service = "buyers", resource = "/otp-validation", method = "POST", priority = "P1" },
    { service = "users-management", resource = "/auth/login", method = "GET", priority = "P1" },
    { service = "users-management", resource = "/verify-captcha", method = "POST", priority = "P1" },
    { service = "users-management", resource = "/otp-validation", method = "POST", priority = "P1" },
    { service = "users-management", resource = "/request-otp", method = "POST", priority = "P1" },
    { service = "buyers", resource = "/auction-register", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/verify-card", method = "POST", priority = "P1" },
    { service = "subdomain", resource = "/subdomain", method = "GET", priority = "P1" },
    { service = "subdomain", resource = "/subdomain", method = "PATCH", priority = "P1" },
    { service = "users-management", resource = "/password-update/{email}", method = "PATCH", priority = "P1" },
    
    # P1 Critical - Payments & Bidding
    { service = "bids", resource = "/update", method = "PATCH", priority = "P1" },
    { service = "payments", resource = "/stripe", method = "GET", priority = "P1" },
    { service = "paypal", resource = "/paypal-order", method = "POST", priority = "P1" },
    { service = "paypal", resource = "/capture-order", method = "GET", priority = "P1" },
    { service = "cart-management", resource = "/cart", method = "GET", priority = "P1" },
    { service = "auctions", resource = "/", method = "POST", priority = "P1" },
    { service = "auctions", resource = "/lots", method = "POST", priority = "P1" },
    { service = "auctions", resource = "/update/{auction_id}", method = "PATCH", priority = "P1" },
    
    # P1 Critical - Viewing & Management
    { service = "buyers", resource = "/view", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/view-lots", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/lot-details", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/paddle", method = "GET", priority = "P1" },
    { service = "auctions", resource = "/view", method = "GET", priority = "P1" },
    { service = "auctions", resource = "/{auction_id}", method = "PATCH", priority = "P1" },
    
    # P1 Critical - Additional Routes 1
    { service = "auctions", resource = "/", method = "GET", priority = "P1" },
    { service = "auctions", resource = "/", method = "PATCH", priority = "P1" },
    { service = "auctions", resource = "/lots", method = "GET", priority = "P1" },
    { service = "auctions", resource = "/admin/lots", method = "GET", priority = "P1" },
    { service = "auctions", resource = "/reorder-lots", method = "POST", priority = "P1" },
    { service = "auctions", resource = "/{auction_id}", method = "DELETE", priority = "P1" },
    { service = "auctions", resource = "/deactivate", method = "POST", priority = "P1" },
    { service = "auctions", resource = "/leaderboard/{auction_id}", method = "GET", priority = "P1" },
    
    # P1 Critical - Additional Routes 2
    { service = "auctions", resource = "/image", method = "DELETE", priority = "P1" },
    { service = "buyers", resource = "/", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/add-address", method = "PATCH", priority = "P1" },
    { service = "buyers", resource = "/links", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/buyer-logs", method = "POST", priority = "P1" },
    { service = "buyers", resource = "/policy/{auction_id}", method = "GET", priority = "P1" },
    { service = "buyers", resource = "/search-lots", method = "GET", priority = "P1" },
    { service = "buyer-wishlist", resource = "/", method = "POST", priority = "P1" },
    { service = "buyer-wishlist", resource = "/remove", method = "DELETE", priority = "P1" },
    
    # P1 Critical - Additional Routes 3
    { service = "buyer-wishlist", resource = "/wishlist", method = "GET", priority = "P1" },
    { service = "address-management", resource = "/address", method = "GET", priority = "P1" },
    { service = "address-management", resource = "/address", method = "PATCH", priority = "P1" },
    { service = "bids", resource = "/", method = "GET", priority = "P1" },
    { service = "bids", resource = "/{id}", method = "GET", priority = "P1" },
    { service = "bids", resource = "/admin/{id}", method = "GET", priority = "P1" },
    { service = "payments", resource = "/payments_webhook", method = "POST", priority = "P1" },
    { service = "paypal", resource = "/paypal-connect", method = "GET", priority = "P1" },
    
    # P1 Critical - Additional Routes 4
    { service = "paypal", resource = "/paypal-connect-webhook", method = "POST", priority = "P1" },
    { service = "paypal", resource = "/paypal-disconnect", method = "PATCH", priority = "P1" },
    { service = "paypal", resource = "/paypal-order-webhook", method = "POST", priority = "P1" },
    { service = "users-management", resource = "/{email}", method = "GET", priority = "P1" },
    { service = "users-management", resource = "/{email}", method = "PATCH", priority = "P1" },
    { service = "users-management", resource = "/generate", method = "GET", priority = "P1" },
    { service = "users-management", resource = "/update-plan/{email}", method = "PATCH", priority = "P1" },
    
    # P1 Critical - Additional Routes 5
    { service = "users-management", resource = "/payment-intent", method = "GET", priority = "P1" },
    { service = "users-management", resource = "/seller-sub-domain", method = "POST", priority = "P1" },
    { service = "users-management", resource = "/stripe", method = "PATCH", priority = "P1" },
    { service = "users-management", resource = "/stripe", method = "GET", priority = "P1" },
    { service = "users-management", resource = "/stripe_webhook_trigger", method = "ANY", priority = "P1" },
    { service = "users-management", resource = "/get-template/{template_name}", method = "GET", priority = "P1" },
    { service = "users-management", resource = "/create-template", method = "POST", priority = "P1" },
    { service = "admin-buyer-bid-history", resource = "/admin/{buyer_id}", method = "PATCH", priority = "P1" },
    { service = "admin-buyer-bid-history", resource = "/admin/buyer/{email_address}", method = "GET", priority = "P1" },
    
    # P1 Critical - Additional Routes 6
    { service = "admin-buyer-bid-history", resource = "/list/{seller_email}/{auction_id}", method = "GET", priority = "P1" },
    { service = "admin-buyer-bid-history", resource = "/bids", method = "GET", priority = "P1" },
    { service = "admin-buyer-bid-history", resource = "/delete-buyer", method = "DELETE", priority = "P1" },
    { service = "seller-bidder-management", resource = "/", method = "GET", priority = "P1" },
    { service = "seller-bidder-management", resource = "/seller-orders", method = "GET", priority = "P1" },
    { service = "lot-bid-history", resource = "/{lot_id}", method = "GET", priority = "P1" },
    { service = "lot-bid-history", resource = "/buyer/{lot_id}", method = "GET", priority = "P1" },
    { service = "lot-bid-history", resource = "/auction/{auction_id}", method = "GET", priority = "P1" },
    { service = "lot-bid-history", resource = "/seller/bids", method = "GET", priority = "P1" },
    
    # P1 Critical - Additional Routes 7
    { service = "orders", resource = "/", method = "GET", priority = "P1" },
    { service = "orders", resource = "/details", method = "GET", priority = "P1" },
    { service = "orders", resource = "/update", method = "PUT", priority = "P1" },
    { service = "orders", resource = "/sales", method = "GET", priority = "P1" },
    { service = "orders", resource = "/seller", method = "GET", priority = "P1" },
    { service = "site-banner", resource = "/", method = "POST", priority = "P1" },
    { service = "site-banner", resource = "/", method = "GET", priority = "P1" },
    { service = "site-banner", resource = "/{audience}", method = "GET", priority = "P1" },
    { service = "site-banner", resource = "/delete/{notification_id}", method = "DELETE", priority = "P1" },
    
    # P1 Critical - Additional Routes 8
    { service = "admin-management", resource = "/auctions", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/buyers", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/buyer-details", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/buyer-auctions", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/{id}", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/clone-auction", method = "POST", priority = "P1" },
    { service = "admin-management", resource = "/order-details", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/auction-purchases", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/auction-details", method = "GET", priority = "P1" },
    
    # P1 Critical - Additional Routes 9
    { service = "admin-management", resource = "/accountings", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/view-seller", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/update-seller-status", method = "POST", priority = "P1" },
    { service = "admin-management", resource = "/unpublish-auction", method = "PATCH", priority = "P1" },
    { service = "admin-management", resource = "/admin_bdd-update/{auction_id}", method = "PATCH", priority = "P1" },
    { service = "admin-management", resource = "/publish-auction/{auction_id}", method = "PATCH", priority = "P1" },
    { service = "admin-management", resource = "/admin-subdomain", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/edit-auction/{auction_id}", method = "PATCH", priority = "P1" },
    { service = "admin-management", resource = "/update-lot", method = "PATCH", priority = "P1" },
    
    # P1 Critical - Additional Routes 10
    { service = "admin-management", resource = "/all-sellers", method = "GET", priority = "P1" },
    { service = "admin-management", resource = "/admin-update-password", method = "PATCH", priority = "P1" },
    { service = "admin-management", resource = "/enable-disable-seller", method = "PATCH", priority = "P1" },
    { service = "admin-management", resource = "/update-seller-settings", method = "PATCH", priority = "P1" },
    { service = "newsletter", resource = "/", method = "PATCH", priority = "P1" },
    
    # P1 Critical - Missing Services
    { service = "quicksight-dashboards", resource = "/", method = "GET", priority = "P1" },
    { service = "quicksight-dashboards", resource = "/auction-view", method = "GET", priority = "P1" },
    { service = "quicksight-dashboards", resource = "/admin-view", method = "GET", priority = "P1" },
    { service = "quicksight-dashboards", resource = "/admin-auction-view", method = "GET", priority = "P1" },
    
    # P2 Medium - Profile Management
    { service = "buyers", resource = "/update-password", method = "POST", priority = "P2" },
    { service = "buyers", resource = "/forgot_password", method = "POST", priority = "P2" },
    { service = "buyers", resource = "/reset_password", method = "POST", priority = "P2" },
    { service = "buyers", resource = "/verify-captcha", method = "POST", priority = "P2" },
    { service = "users-management", resource = "/verify-captcha", method = "POST", priority = "P2" },
    { service = "users-management", resource = "/forgot_password", method = "POST", priority = "P2" },
    { service = "users-management", resource = "/reset_password", method = "POST", priority = "P2" },
    { service = "buyers", resource = "/profile", method = "PATCH", priority = "P2" },
    { service = "address-management", resource = "/address", method = "POST", priority = "P2" },
    
    # P2 Medium - Auction Management
    { service = "auctions", resource = "/clone", method = "POST", priority = "P2" },
    { service = "buyers", resource = "/approval", method = "PATCH", priority = "P2" },
    { service = "auctions", resource = "/lots", method = "PATCH", priority = "P2" },
    { service = "auctions", resource = "/lots", method = "DELETE", priority = "P2" },
    { service = "auctions", resource = "/import", method = "POST", priority = "P2" },
    
    # P3 Low - Search & Other
    { service = "order-management", resource = "/orders", method = "GET", priority = "P3" }
  ]
  
  # Threshold mapping by priority
  thresholds = {
    P1 = 1  # Immediate alert for critical routes
    P2 = 3  # Alert after 3 errors for medium priority
    P3 = 5  # Alert after 5 errors for low priority
  }
  
  # P1 Critical routes
  p1_routes = [for route in local.all_routes : route if route.priority == "P1"]
  
  # P2 Medium routes
  p2_routes = [for route in local.all_routes : route if route.priority == "P2"]
  
  # P3 Low routes
  p3_routes = [for route in local.all_routes : route if route.priority == "P3"]
}

# P1 Critical alarms
resource "aws_cloudwatch_metric_alarm" "p1_alarms" {
  for_each = { for route in local.p1_routes : "${route.service}-${replace(route.resource, "/", "_")}-${route.method}" => route }
  
  provider            = aws.deployment-eu
  alarm_name          = "P1-IndyAuction-${each.value.service}-${var.STAGE}-${substr(replace(replace(replace(each.value.resource, "/", "-"), "{", ""), "}", ""), 1, -1)}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Maximum"
  threshold           = 1
  alarm_description   = "P1 alarm for ${each.value.service} ${each.value.method} ${each.value.resource} - 5XX errors"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    ApiName  = "${var.STAGE}-${each.value.service}"
    Resource = each.value.resource
    Method   = each.value.method
    Stage    = var.STAGE
  }
  
  tags = {
    Priority = "P1"
    Service  = each.value.service
    Route    = replace(replace(each.value.resource, "{", ""), "}", "")
    Method   = each.value.method
  }
}

# P2 Medium alarms
resource "aws_cloudwatch_metric_alarm" "p2_alarms" {
  for_each = { for route in local.p2_routes : "${route.service}-${replace(route.resource, "/", "_")}-${route.method}" => route }
  
  provider            = aws.deployment-eu
  alarm_name          = "P2-IndyAuction-${each.value.service}-${var.STAGE}-${substr(replace(replace(replace(each.value.resource, "/", "-"), "{", ""), "}", ""), 1, -1)}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Maximum"
  threshold           = 3
  alarm_description   = "P2 alarm for ${each.value.service} ${each.value.method} ${each.value.resource} - 5XX errors"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    ApiName  = "${var.STAGE}-${each.value.service}"
    Resource = each.value.resource
    Method   = each.value.method
    Stage    = var.STAGE
  }
  
  tags = {
    Priority = "P2"
    Service  = each.value.service
    Route    = replace(replace(each.value.resource, "{", ""), "}", "")
    Method   = each.value.method
  }
}

# P3 Low alarms
resource "aws_cloudwatch_metric_alarm" "p3_alarms" {
  for_each = { for route in local.p3_routes : "${route.service}-${replace(route.resource, "/", "_")}-${route.method}" => route }
  
  provider            = aws.deployment-eu
  alarm_name          = "P3-IndyAuction-${each.value.service}-${var.STAGE}-${substr(replace(replace(replace(each.value.resource, "/", "-"), "{", ""), "}", ""), 1, -1)}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Maximum"
  threshold           = 5
  alarm_description   = "P3 alarm for ${each.value.service} ${each.value.method} ${each.value.resource} - 5XX errors"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarm_topic.arn]
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    ApiName  = "${var.STAGE}-${each.value.service}"
    Resource = each.value.resource
    Method   = each.value.method
    Stage    = var.STAGE
  }
  
  tags = {
    Priority = "P3"
    Service  = each.value.service
    Route    = replace(replace(each.value.resource, "{", ""), "}", "")
    Method   = each.value.method
  }
}

