 

#AWS Provider with profile main account
provider "aws" {
  region  = var.REGION
  alias   = "deployment-eu" # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
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

#Creating alarm for Process cart error
resource "aws_cloudwatch_metric_alarm" "cloudwatch_rum_alarm_process_cart_500_status_code" {
  provider = aws.deployment-eu
  alarm_name     = "indyauction-${var.STAGE}-Stauscode 5xx Process Cart"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Http5xxCount"
  namespace           = "AWS/Lambda"
  period              = 300  # 5 min (adjust based on your desired granularity)
  statistic           = "Sum"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = 1

  alarm_actions = [aws_sns_topic.cloudwatch_rum_topic.arn]
   
   
  dimensions = {
    FunctionName = "auctions-${var.STAGE}-process-cart"
  }
}


#Creating alarm for Admin web application erros 
resource "aws_cloudwatch_metric_alarm" "cloudwatch_rum_alarm_admin_500_status_code" {
  provider = aws.deployment-eu
  alarm_name     = "indyauction-${var.STAGE}-Stauscode 5xx Admin Web Application"
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
  alarm_name     = "indyauction-${var.STAGE}-Stauscode 5xx Buyer Web Application"
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
  alarm_name     = "indyauction-${var.STAGE}-Stauscode 5xx Seller Web Application"
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
  alarm_name     = "indyauction-${var.STAGE}-DocuemntDB Max Connection"
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
  alarm_name     = "indyauction-${var.STAGE}-DocuemntDB CPU"
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
  alarm_name     = "indyauction-${var.STAGE}-DocuemntDB Memory"
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
  alarm_name     = "indyauction-${var.STAGE}-ECS Service Memory"
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
  alarm_name     = "indyauction-${var.STAGE}-ECS Service CPU"
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
  alarm_name     = "indyauction-${var.STAGE}-Redis CPU"
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
  alarm_name     = "indyauction-${var.STAGE}-Redis CPU"
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



resource "aws_sns_topic_subscription" "cloudwatch_rum_subscription_2" {
  provider = aws.deployment-eu
  topic_arn = aws_sns_topic.cloudwatch_rum_topic.arn
  protocol  = "email"
  endpoint  = "namratha.shettigar@7edge.com"  # Replace with your email address
}
resource "aws_sns_topic_subscription" "cloudwatch_rum_subscription_1" {
  provider = aws.deployment-eu
  topic_arn = aws_sns_topic.cloudwatch_rum_topic.arn
  protocol  = "email"
  endpoint  = "admin@indy.auction"  # Replace with your email address
}