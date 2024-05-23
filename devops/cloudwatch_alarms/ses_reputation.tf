 


#AWS Provider with profile main account
provider "aws" {
  region  = var.REGION
  alias   = "deployment-eu" # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}


# Create an SNS topic for notifications
resource "aws_sns_topic" "ses_reputation_topic" {
  name = "SESReputationTopic"
  provider = aws.deployment-eu
}

# Create an IAM role for CloudWatch Alarms to use
resource "aws_iam_role" "ses_reputation_role" {
  name = "SESReputationRole"
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
resource "aws_iam_role_policy_attachment" "ses_reputation_policy_attachment" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM"
  role       = aws_iam_role.ses_reputation_role.name
  provider = aws.deployment-eu
}

# Create CloudWatch Alarms for SES Reputation metrics
resource "aws_cloudwatch_metric_alarm" "ses_reputation_alarm" {
  provider = aws.deployment-eu
  count          = 5
  alarm_name     = "SESReputationAlarm-${element([1, 2, 3, 4, 5], count.index)}-indyauction-${var.STAGE}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Reputation.BounceRate"
  namespace           = "AWS/SES"
  period              = 86400  # 1 day (adjust based on your desired granularity)
  statistic           = "Average"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = element([0.01, 0.02, 0.03, 0.04, 0.05], count.index)

  alarm_actions = [aws_sns_topic.ses_reputation_topic.arn]
  ok_actions    = [aws_sns_topic.ses_reputation_topic.arn]
  insufficient_data_actions = [aws_sns_topic.ses_reputation_topic.arn]
}


resource "aws_cloudwatch_metric_alarm" "ses_reputation_alarm_complaint" {
  provider = aws.deployment-eu
  count          = 5
  alarm_name     = "SESComplaintAlarm-${element([1, 2, 3, 4, 5], count.index)}-indyauction-${var.STAGE}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Reputation.ComplaintRate"
  namespace           = "AWS/SES"
  period              = 86400  # 1 day (adjust based on your desired granularity)
  statistic           = "Average"
  
  # Set your desired reputation threshold (e.g., 90 for 90%)
  threshold = element([0.01, 0.02, 0.03, 0.04, 0.05], count.index)

  alarm_actions = [aws_sns_topic.ses_reputation_topic.arn]
  ok_actions    = [aws_sns_topic.ses_reputation_topic.arn]
  insufficient_data_actions = [aws_sns_topic.ses_reputation_topic.arn]
}

# Subscribe an email address to the SNS topic for notifications
resource "aws_sns_topic_subscription" "ses_reputation_subscription" {
  provider = aws.deployment-eu
  topic_arn = aws_sns_topic.ses_reputation_topic.arn
  protocol  = "email"
  endpoint  = "ranjith.n@7edge.com"  # Replace with your email address
}
resource "aws_sns_topic_subscription" "ses_reputation_subscription_2" {
  provider = aws.deployment-eu
  topic_arn = aws_sns_topic.ses_reputation_topic.arn
  protocol  = "email"
  endpoint  = "namratha.shettigar@7edge.com"  # Replace with your email address
}