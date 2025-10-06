 

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
  alarm_name          = "Process Cart Logs Error Alarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = aws_cloudwatch_log_metric_filter.process_cart_lambda_error_alarm.metric_transformation[0].name
  namespace           = aws_cloudwatch_log_metric_filter.process_cart_lambda_error_alarm.metric_transformation[0].namespace
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alarm when Lambda logs contain 'error'"

  # Actions
  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
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
  alarm_name          = "IndyAuction-${var.STAGE}-Save-To-Cache-Logs-Error-Alarm"
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
  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
  provider             = aws.deployment-eu
}




#Creating alarm for Admin web application erros 
resource "aws_cloudwatch_metric_alarm" "cloudwatch_rum_alarm_admin_500_status_code" {
  provider = aws.deployment-eu
  alarm_name     = "IndyAuction-${var.STAGE}-Stauscode 5xx Admin Web Application"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Http5xxCount"
  namespace           = "AWS/RUM"
  period              = 300  # 1 min (adjust based on your desired granularity)
  statistic           = "Sum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 1

  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
   
   
  dimensions = {
    application_name = "Admin-Web-Application"
  }
}


#Creating alarm for Buyer web application erros 
resource "aws_cloudwatch_metric_alarm" "cloudwatch_rum_alarm_buyer_500_status_code" {
  provider = aws.deployment-eu
  alarm_name     = "IndyAuction-${var.STAGE}-Stauscode 5xx Buyer Web Application"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Http5xxCount"
  namespace           = "AWS/RUM"
  period              = 300  # 1 min (adjust based on your desired granularity)
  statistic           = "Sum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 1

  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
   
   
  dimensions = {
    application_name = "Buyer-Web-Application"
  }
}

#Creating alarm for Seller web application erros 
resource "aws_cloudwatch_metric_alarm" "cloudwatch_rum_alarm_seller_500_status_code" {
  provider = aws.deployment-eu
  alarm_name     = "IndyAuction-${var.STAGE}-Stauscode 5xx Seller Web Application"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Http5xxCount"
  namespace           = "AWS/RUM"
  period              = 300  # 1 min (adjust based on your desired granularity)
  statistic           = "Sum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 1

  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
   
   
  dimensions = {
    application_name = "Seller-Web-Application"
  }
}


# Create CloudWatch Alarms for DocuementDB maximum connections metrics
resource "aws_cloudwatch_metric_alarm" "cloudwatch_documentdb_connections" {
  provider = aws.deployment-eu
  alarm_name     = "IndyAuction-${var.STAGE}-DocuemntDB Max Connection"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "DatabaseConnectionsMax"
  namespace           = "AWS/DocDB"
  period              = 60  # 1 min (adjust based on your desired granularity)
  statistic           = "Maximum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 350

  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
   
  dimensions = {
    DBClusterIdentifier = "docdb-mongodb-instance"
  }
}
# Create CloudWatch Alarms for DocuementDB CPU utilization metrics
resource "aws_cloudwatch_metric_alarm" "cloudwatch_docuementdb_cpu" {
  provider = aws.deployment-eu
  alarm_name     = "IndyAuction-${var.STAGE}-DocuemntDB CPU"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/DocDB"
  period              = 60  # 1 min (adjust based on your desired granularity)
  statistic           = "Maximum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 70

  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
   
  dimensions = {
    DBClusterIdentifier = "docdb-mongodb-instance"
  }
}

# Create CloudWatch Alarms for DocuementDB Memory utilization metrics
resource "aws_cloudwatch_metric_alarm" "cloudwatch_docuementdb_memory" {
  provider = aws.deployment-eu
  alarm_name     = "IndyAuction-${var.STAGE}-DocuemntDB Memory"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeLocalStorage"
  namespace           = "AWS/DocDB"
  period              = 3600  # 1 h (adjust based on your desired granularity)
  statistic           = "Maximum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 3221225472

  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
   
  dimensions = {
    DBClusterIdentifier = "docdb-mongodb-instance"
  }
}


# Create CloudWatch Alarms for ECS Service Memory utilization metrics
resource "aws_cloudwatch_metric_alarm" "cloudwatch_ecs_memory" {
  provider = aws.deployment-eu
  alarm_name     = "IndyAuction-${var.STAGE}ECS Service Memory"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 300  # 5m (adjust based on your desired granularity)
  statistic           = "Maximum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 50

  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
   
  dimensions = {
    ClusterName = "websocket-cluster"
    ServiceName = "websocket-ecs-service"
  }
}

# Create CloudWatch Alarms for ECS Service CPU utilization metrics
resource "aws_cloudwatch_metric_alarm" "cloudwatch_ecs_cpu" {
  provider = aws.deployment-eu
  alarm_name     = "IndyAuction-${var.STAGE}-ECS Service CPU"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300  # 5m (adjust based on your desired granularity)
  statistic           = "Maximum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 50

  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
   
  dimensions = {
    ClusterName = "websocket-cluster"
    ServiceName = "websocket-ecs-service"
  }
}

# Create CloudWatch Alarms for Redis  CPU utilization metrics for primary node
resource "aws_cloudwatch_metric_alarm" "cloudwatch_redis_cpu" {
  provider = aws.deployment-eu
  alarm_name     = "IndyAuction-${var.STAGE}-Redis-CPU"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 300  # 5m (adjust based on your desired granularity)
  statistic           = "Maximum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 70

  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
   
  dimensions = {
    CacheClusterId = "websocket-redis-cluster-enabled-0001-002"
    CacheNodeId = "0001"
  }
}

# Create CloudWatch Alarms for Redis  CPU utilization metrics for replica node
resource "aws_cloudwatch_metric_alarm" "cloudwatch_redis_cpu_node_replica" {
  provider = aws.deployment-eu
  alarm_name     = "IndyAuction-${var.STAGE}-Redis-CPU"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 300  # 5m (adjust based on your desired granularity)
  statistic           = "Maximum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 70

  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
   
  dimensions = {
    CacheClusterId = "websocket-redis-cluster-enabled-0001-001"
    CacheNodeId = "0001"
  }
}



# resource "aws_cloudwatch_metric_alarm" "redis_network_bytes_out" {
#   provider             = aws.deployment-eu
#   alarm_name          = "IndyAuction-${var.STAGE}-Redis-NetworkBytesOut"
#   comparison_operator = "GreaterThanOrEqualToThreshold"
#   evaluation_periods  = 1
#   metric_name         = "NetworkBytesOut"
#   namespace           = "AWS/ElastiCache"
#   period              = 300  # 5 minutes
#   statistic           = "Maximum"
#   threshold           = 125829120  # 12 MB (adjust based on analysis)
#   alarm_actions       = [aws_sns_topic.cloudwatch_rum_topic.arn]
  
#   dimensions = {
#     CacheClusterId = "websocket-redis-cluster-enabled-0001-002"
#     CacheNodeId = "0001"
#   }
# }

# resource "aws_cloudwatch_metric_alarm" "redis_network_bytes_in" {
#   provider             = aws.deployment-eu
#   alarm_name          = "IndyAuction-${var.STAGE}-Redis-NetworkBytesIn"
#   comparison_operator = "GreaterThanOrEqualToThreshold"
#   evaluation_periods  = 1
#   metric_name         = "NetworkBytesIn"
#   namespace           = "AWS/ElastiCache"
#   period              = 3000  # 5 minutes
#   statistic           = "Maximum"
#   threshold           = 104857600  # 10 MB
#   alarm_actions       = [aws_sns_topic.cloudwatch_rum_topic.arn]
  
#   dimensions = {
#     CacheClusterId = "websocket-redis-cluster-enabled-0001-002"
#     CacheNodeId = "0001"
#   }
# }

resource "aws_cloudwatch_metric_alarm" "redis_network_packets_exceeded" {
  provider             = aws.deployment-eu
  alarm_name          = "IndyAuction-${var.STAGE}-Redis-NetworkPacketsAllowanceExceeded"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "NetworkPacketsPerSecondAllowanceExceeded"
  namespace           = "AWS/ElastiCache"
  period              = 300  # 5 minutes
  statistic           = "Maximum"
  threshold           = 0  # Alert when allowance is exceeded
  alarm_actions       = [aws_sns_topic.cloudwatch_rum_topic.arn]
  
  dimensions = {
    CacheClusterId = "websocket-redis-cluster-enabled-0001-002"
    CacheNodeId = "0001"
  }
}


resource "aws_cloudwatch_metric_alarm" "redis_memory_evictions" {
  provider             = aws.deployment-eu
  alarm_name          = "IndyAuction-${var.STAGE}-Redis-MemoryEvictions"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = 300  # 5 minutes
  statistic           = "Sum"
  threshold           = 1  # Trigger if more than 10 evictions occur
  alarm_actions       = [aws_sns_topic.cloudwatch_rum_topic.arn]
  
  dimensions = {
    CacheClusterId = "websocket-redis-cluster-enabled-0001-001"
    CacheNodeId    = "0001"
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_memory_usage" {
  provider             = aws.deployment-eu
  alarm_name          = "IndyAuction-${var.STAGE}--Redis-MemoryUsage"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300  # 5 minutes
  statistic           = "Maximum"
  threshold           = 70  # Alert if memory usage exceeds 80%
  alarm_actions       = [aws_sns_topic.cloudwatch_rum_topic.arn]
  
  dimensions = {
    CacheClusterId = "websocket-redis-cluster-enabled-0001-001"
    CacheNodeId    = "0001"
  }
}


# STEP FUNCTIONS ALARMS
resource "aws_cloudwatch_metric_alarm" "stepfunction_executions_failed" {
  alarm_name          = "IndyAuction-${var.STAGE}-StepFunction-ExecutionsFailed"
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
  alarm_description   = "Failed executions in Step Function"
    alarm_actions     = [aws_sns_topic.cloudwatch_rum_topic.arn]
  provider            = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "stepfunction_executions_timed_out" {
  alarm_name          = "IndyAuction-${var.STAGE}-StepFunction-ExecutionsTimedOut"
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
  alarm_actions       = [aws_sns_topic.cloudwatch_rum_topic.arn]
  provider             = aws.deployment-eu
}




resource "aws_cloudwatch_metric_alarm" "lambda_concurrent_executions" {
  alarm_name          = "IndyAuction-${var.STAGE}-Lambda-ConcurrentExecutions"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ConcurrentExecutions"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Maximum"
  threshold           = 900
  alarm_description   = "Concurrent Lambda executions > 500"
    alarm_actions       = [aws_sns_topic.cloudwatch_rum_topic.arn]
  provider             = aws.deployment-eu
}


# ECS ALARMS
resource "aws_cloudwatch_metric_alarm" "ecs_task_launch_failures" {
  alarm_name          = "IndyAuction-${var.STAGE}-ECS-TaskLaunchFailures"
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
  alarm_description   = "ECS task launch failures > 1"
    alarm_actions       = [aws_sns_topic.cloudwatch_rum_topic.arn]
  provider             = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "ecs_task_count" {
  alarm_name          = "IndyAuction-${var.STAGE}-ECS-TaskCountExceeded"
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
  alarm_description   = "ECS running task count > 1"
  alarm_actions       = [aws_sns_topic.cloudwatch_rum_topic.arn]
  provider             = aws.deployment-eu
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
  alarm_name          = "ThrottlingExceptionAlarm-Unpublish-Auction"
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
  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn] # Define this if needed
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
  alarm_name          = "IndyAuction-${var.STAGE}-Redis-Data-Miss-Email-Fails"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = aws_cloudwatch_log_metric_filter.ecs_type_error_filter.metric_transformation[0].name
  namespace           = aws_cloudwatch_log_metric_filter.ecs_type_error_filter.metric_transformation[0].namespace
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert when Redis data is missing or email sending fails"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.cloudwatch_rum_topic.arn]
  provider            = aws.deployment-eu
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
