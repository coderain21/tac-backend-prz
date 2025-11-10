
data "external" "env" {
  program = ["./envs.sh"]
}

#AWS Provider with profile Stage account
provider "aws" {
  region = "eu-west-2"
  alias = "deployment-eu"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}


provider "aws" {
  region = "us-east-1"
  alias = "route53-account"   # Specify a default AWS region here
  profile = "${var.ROUTE53_ACCOUNT}"
}

terraform {
  backend "s3" {
    region       = "eu-west-2"  # Replace with the appropriate AWS region
    encrypt      = true
    use_lockfile = true  # Enable the S3 locking feature
  }
}

locals {
  sub_domain = var.STAGE == "prod" ? var.DOMAIN : "${var.STAGE}.${var.DOMAIN}"
}

data "aws_vpc" "default" {
  default = true
  provider = aws.deployment-eu
}




data "aws_ssm_parameter" "subnet" {
  name = "SUBNET_ID_PUBLIC"
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "security_group" {
  name = "SECURITY_GROUP_ID"
  provider = aws.deployment-eu
}
resource "aws_default_subnet" "default_az1" {
  availability_zone = "eu-west-2a"
  provider = aws.deployment-eu
}

data "aws_acm_certificate" "existing_certificate" {
  domain   = "*.${local.sub_domain}"
  statuses = ["ISSUED", "PENDING_VALIDATION"] # Specify certificate statuses you want to consider as "existing"
  provider = aws.deployment-eu
}



resource "aws_iam_role" "ecs_task_execution_role" {
  name = "ecs-task-execution-role"
  provider = aws.deployment-eu
  assume_role_policy = <<EOF
{
 "Version": "2012-10-17",
 "Statement": [
   {
     "Action": "sts:AssumeRole",
     "Principal": {
       "Service": "ecs-tasks.amazonaws.com"
     },
     "Effect": "Allow",
     "Sid": ""
   },
   {
     "Action": "sts:AssumeRole",
     "Principal": {
       "Service": "states.amazonaws.com"  
     },
     "Effect": "Allow",
     "Sid": ""
   }
 ]
}
EOF
}

resource "aws_iam_role_policy_attachment" "stepfunctions_full_access" {
  role      = "${aws_iam_role.ecs_task_execution_role.name}"
  policy_arn = "arn:aws:iam::aws:policy/AWSStepFunctionsFullAccess"
  provider = aws.deployment-eu
}


resource "aws_iam_role" "ecs_task_role" {
  name = "ecs-task-role"
  provider = aws.deployment-eu
  assume_role_policy = <<EOF
{
 "Version": "2012-10-17",
 "Statement": [
   {
     "Action": "sts:AssumeRole",
     "Principal": {
       "Service": "ecs-tasks.amazonaws.com"
     },
     "Effect": "Allow",
     "Sid": ""
   },
   {
     "Action": "sts:AssumeRole",
     "Principal": {
       "Service": "states.amazonaws.com"  
     },
     "Effect": "Allow",
     "Sid": ""
   }
 ]
}
EOF
}
resource "aws_iam_role_policy_attachment" "stepfunctions_full_access_task_role" {
  role      = "${aws_iam_role.ecs_task_role.name}"
  policy_arn = "arn:aws:iam::aws:policy/AWSStepFunctionsFullAccess"
  provider = aws.deployment-eu
}



resource "aws_iam_role_policy_attachment" "task_s3" {
  role       = "${aws_iam_role.ecs_task_role.name}"
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
  provider = aws.deployment-eu
}
# Attach CloudWatch Logs full access policy
resource "aws_iam_role_policy_attachment" "cloudwatch_logs_full_access_task_role" {
  role      = "${aws_iam_role.ecs_task_role.name}"
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
  provider = aws.deployment-eu
}

# Attach CloudWatch full access policy
resource "aws_iam_role_policy_attachment" "cloudwatch_full_access_task_role" {
  role     = "${aws_iam_role.ecs_task_role.name}"
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchFullAccess"
  provider = aws.deployment-eu
}
# Attach CloudWatch Logs full access policy
resource "aws_iam_role_policy_attachment" "cloudwatch_logs_full_access_task_execution_role" {
  role      = "${aws_iam_role.ecs_task_execution_role.name}"
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
  provider = aws.deployment-eu
}

# Attach CloudWatch full access policy
resource "aws_iam_role_policy_attachment" "cloudwatch_full_access_task_execution_role" {
  role      = "${aws_iam_role.ecs_task_execution_role.name}"
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchFullAccess"
  provider = aws.deployment-eu
}
resource "aws_iam_role_policy_attachment" "ecs-task-execution-role-policy-attachment" {
  role       = "${aws_iam_role.ecs_task_execution_role.name}"
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
  provider = aws.deployment-eu
}

# ECS Cluster
resource "aws_ecs_cluster" "websocket-cluster" {
  name = "websocket-cluster"
  provider = aws.deployment-eu
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}
# ECR Repositories
resource "aws_ecr_repository" "repo1" {
  name = "websocket-repo"
  provider = aws.deployment-eu
  force_delete = true
  image_scanning_configuration {
    scan_on_push = true
  }
}
# ECR Repositories
resource "aws_ecr_repository" "repo" {
  name = "update-auction-repo"
  provider = aws.deployment-eu
  force_delete = true
  image_scanning_configuration {
    scan_on_push = true
  }
}


########################

# data "aws_s3_bucket_object" "my_objects" {
#   bucket = "ecs-deployment-bucket"
#   key = "ecr-credential/task-definition.json"
#   provider = aws.deployment-eu
# }

locals {
  definitions = jsonencode([
    {
      name      = "websocket-container"
      image     = "${resource.aws_ecr_repository.repo1.repository_url}:latest"
      cpu       = 0
      essential = true
      portMappings = [
        {
          containerPort = 5000
          protocol= "tcp"
          hostPort = 5000
        }
      ]
      readonlyRootFilesystem = true
      environment = [
        # Loop over each key in the parsed JSON and create environment variables
        for key, value in data.external.env.result :
        {
          name  = key
          value = value
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-create-group = "true"
          awslogs-group= "/ecs/task"
          awslogs-region= "${var.REGION}"
          awslogs-stream-prefix= "ecs"
        }
      }
    }
  ])
}
data "aws_ssm_parameter" "cpu" {
  name = "CPU"
  provider = aws.deployment-eu
}
data "aws_ssm_parameter" "memory" {
  name = "MEMORY"
  provider = aws.deployment-eu
}
data "aws_ssm_parameter" "ecs_cpu" {
  name = "ECS_CPU"
  provider = aws.deployment-eu
}
data "aws_ssm_parameter" "ecs_memory" {
  name = "ECS_MEMORY"
  provider = aws.deployment-eu
}

resource "aws_ecs_task_definition" "websocket-task-definition" {
  family                   = "websocket-task-definition"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  task_role_arn            = resource.aws_iam_role.ecs_task_role.arn
  execution_role_arn       = resource.aws_iam_role.ecs_task_execution_role.arn
  cpu                      = data.aws_ssm_parameter.cpu.value
  memory                   = data.aws_ssm_parameter.memory.value
  depends_on = [resource.aws_ecs_cluster.websocket-cluster,resource.aws_ecr_repository.repo1]
  container_definitions = local.definitions
  skip_destroy = true
  provider = aws.deployment-eu
}

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  provider = aws.deployment-eu
}


# Application Load Balancer (ALB) and Target Group
resource "aws_lb" "load-balancer" {
  name               = "web-socket-load-balancer"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [data.aws_ssm_parameter.security_group.value]  # Security group for the Load Balancer
  subnets            = [data.aws_ssm_parameter.subnet.value, resource.aws_default_subnet.default_az1.id]

  enable_deletion_protection = true
  provider = aws.deployment-eu
}


data "aws_route53_zone" "domain_zone" {
  name = local.sub_domain # Replace with your domain name
  provider = aws.route53-account
}

resource "aws_route53_record" "my_cname" {
  name    = "websocket.${local.sub_domain}" # Replace with your desired CNAME
  type    = "A"
  zone_id = data.aws_route53_zone.domain_zone.zone_id  # Replace with your Route 53 hosted zone ID
  alias {
    name                   = aws_lb.load-balancer.dns_name
    zone_id                = aws_lb.load-balancer.zone_id
    evaluate_target_health = true
  }
  provider = aws.route53-account
}

# Target Group
resource "aws_lb_target_group" "target_group" {
  name     = "target-group-websocket"
  port     = 80
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.default.id  # Use VPC ID from default VPC
  target_type = "ip"
  health_check {
    enabled             = true
    interval            = 30             # seconds between checks
    path                = "/"            # health check URL path
    timeout             = 5              # seconds before timeout
    healthy_threshold   = 5             # consecutive successes to mark healthy
    unhealthy_threshold = 2           # consecutive failures to mark unhealthy
    matcher             = "200"      # HTTP status codes considered healthy
  }
  provider = aws.deployment-eu
}

# Listener Rule

# Listener
resource "aws_lb_listener" "listener" {
  load_balancer_arn = aws_lb.load-balancer.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = data.aws_acm_certificate.existing_certificate.arn

  default_action {
    type             = "forward"
      target_group_arn = aws_lb_target_group.target_group.arn
  }
  provider = aws.deployment-eu
}


resource "aws_ecs_service" "ecs_service" {
  name            = "websocket-ecs-service"
  cluster         = resource.aws_ecs_cluster.websocket-cluster.id
  task_definition = resource.aws_ecs_task_definition.websocket-task-definition.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = [data.aws_ssm_parameter.subnet.value]  # Fetch default subnets dynamically
    security_groups = [data.aws_ssm_parameter.security_group.value]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.target_group.arn
    container_name   = "websocket-container"
    container_port   = 5000
  }
  provider = aws.deployment-eu
}

resource "aws_appautoscaling_target" "target" {
  max_capacity = 10
  min_capacity = 2
  resource_id =  "service/${aws_ecs_cluster.websocket-cluster.name}/${aws_ecs_service.ecs_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace = "ecs"
  provider = aws.deployment-eu
}


resource "aws_appautoscaling_policy" "cpu" {
  name = "cpu"
  policy_type = "TargetTrackingScaling"
  resource_id = aws_appautoscaling_target.target.resource_id
  scalable_dimension = aws_appautoscaling_target.target.scalable_dimension
  service_namespace = aws_appautoscaling_target.target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value = data.aws_ssm_parameter.ecs_cpu.value
  }
  provider = aws.deployment-eu
}
resource "aws_appautoscaling_policy" "memory" {
  name = "memory"
  policy_type = "TargetTrackingScaling"
  resource_id = aws_appautoscaling_target.target.resource_id
  scalable_dimension = aws_appautoscaling_target.target.scalable_dimension
  service_namespace = aws_appautoscaling_target.target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }

    target_value = data.aws_ssm_parameter.ecs_memory.value
  }
  provider = aws.deployment-eu
}
resource "aws_appautoscaling_policy" "request_count" {
  name = "request-count"
  policy_type = "TargetTrackingScaling"
  resource_id = aws_appautoscaling_target.target.resource_id
  scalable_dimension = aws_appautoscaling_target.target.scalable_dimension
  service_namespace = aws_appautoscaling_target.target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label = "${aws_lb.load-balancer.arn_suffix}/${aws_lb_target_group.target_group.arn_suffix}"
    }
    target_value = 25
    scale_out_cooldown = 300
    scale_in_cooldown = 300
  }
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "socket" {
  name  = "SOCKET_URL"
  type  = "String"
  value = "https://websocket.${local.sub_domain}"
  provider = aws.deployment-eu
  overwrite = true
}


resource "aws_ssm_parameter" "ecr_rep_uri" {
  name  = "ECR_REPO_URI"
  type  = "String"
  value = "${aws_ecr_repository.repo1.repository_url}"
  provider = aws.deployment-eu
  overwrite = true
}


resource "aws_ssm_parameter" "ecr_repo_name" {
  name  = "ECR_REPO_NAME"
  type  = "String"
  value = "websocket-repo"
  provider = aws.deployment-eu
  overwrite = true
}
resource "aws_ssm_parameter" "ecr_repo_tag" {
  name  = "ECR_REPO_URI_TAG"
  type  = "String"
  value = "latest"
  provider = aws.deployment-eu
  overwrite = true
}

resource "aws_ssm_parameter" "alb_arn" {
  name  = "ALB_ARN"
  type  = "String"
  value = aws_lb.load-balancer.arn
  provider = aws.deployment-eu
  overwrite = true
}

# Reference SES reputation topic from ses_alert module
data "aws_sns_topic" "ses_reputation_topic" {
  name = "SESReputationTopic"
  provider = aws.deployment-eu
}

# Step Scaling Policy for CPU (handles both scale-out and scale-in)
resource "aws_appautoscaling_policy" "ecs_cpu_scaling" {
  name               = "ecs-bidding-cpu-scaling-${var.STAGE}"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.target.resource_id
  scalable_dimension = aws_appautoscaling_target.target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.target.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown                = 15
    metric_aggregation_type = "Maximum"

    step_adjustment {
      metric_interval_lower_bound = 0
      scaling_adjustment          = 1
    }
  }
  provider = aws.deployment-eu
}

# Step Scaling Policy for Memory (handles both scale-out and scale-in)
resource "aws_appautoscaling_policy" "ecs_memory_scaling" {
  name               = "ecs-bidding-memory-scaling-${var.STAGE}"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.target.resource_id
  scalable_dimension = aws_appautoscaling_target.target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.target.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown                = 15
    metric_aggregation_type = "Maximum"

    step_adjustment {
      metric_interval_lower_bound = 0
      scaling_adjustment          = 1
    }
  }
  provider = aws.deployment-eu
}

# Step Scaling Policy for Request Count (handles both scale-out and scale-in)
resource "aws_appautoscaling_policy" "ecs_request_scaling" {
  name               = "ecs-bidding-request-scaling-${var.STAGE}"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.target.resource_id
  scalable_dimension = aws_appautoscaling_target.target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.target.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown               = 60
    metric_aggregation_type = "Maximum"

    step_adjustment {
      metric_interval_lower_bound = 0
      scaling_adjustment          = 1
    }
    
    step_adjustment {
      metric_interval_upper_bound = 0
      scaling_adjustment          = -1
    }
  }
  provider = aws.deployment-eu
}

# CloudWatch Alarm for ECS CPU Scale Out
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_scale_out" {
  alarm_name          = "ecs-bidding-cpu-scale-out-${var.STAGE}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 30
  statistic           = "Maximum"
  threshold           = 65
  alarm_description   = "Scale out quickly when CPU > 65% for 30s"
  alarm_actions       = [aws_appautoscaling_policy.ecs_cpu_scaling.arn, data.aws_sns_topic.ses_reputation_topic.arn]

  dimensions = {
    ServiceName = aws_ecs_service.ecs_service.name
    ClusterName = aws_ecs_cluster.websocket-cluster.name
  }
  treat_missing_data = "notBreaching"
  provider = aws.deployment-eu
}

# CloudWatch Alarm for ECS CPU Scale In
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_scale_in" {
  alarm_name          = "ecs-bidding-cpu-scale-in-${var.STAGE}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 40
  alarm_description   = "Scale in when CPU < 40% for 3 minutes"
  alarm_actions       = [aws_appautoscaling_policy.ecs_cpu_scaling.arn, data.aws_sns_topic.ses_reputation_topic.arn]

  dimensions = {
    ServiceName = aws_ecs_service.ecs_service.name
    ClusterName = aws_ecs_cluster.websocket-cluster.name
  }
  treat_missing_data = "notBreaching"
  provider = aws.deployment-eu
}

# ECS Memory scale out - reacts in 30s
resource "aws_cloudwatch_metric_alarm" "ecs_memory_scale_out" {
  alarm_name          = "ecs-bidding-memory-scale-out-${var.STAGE}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 65
  alarm_description   = "Scale out quickly when Memory > 65% for 30s"
  alarm_actions       = [aws_appautoscaling_policy.ecs_memory_scaling.arn, data.aws_sns_topic.ses_reputation_topic.arn]

  dimensions = {
    ServiceName = aws_ecs_service.ecs_service.name
    ClusterName = aws_ecs_cluster.websocket-cluster.name
  }
  treat_missing_data = "notBreaching"
  provider = aws.deployment-eu
}

# ECS Memory scale in - slower decay
resource "aws_cloudwatch_metric_alarm" "ecs_memory_scale_in" {
  alarm_name          = "ecs-bidding-memory-scale-in-${var.STAGE}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 40
  alarm_description   = "Scale in when Memory < 40% for 3 minutes"
  alarm_actions       = [aws_appautoscaling_policy.ecs_memory_scaling.arn, data.aws_sns_topic.ses_reputation_topic.arn]

  dimensions = {
    ServiceName = aws_ecs_service.ecs_service.name
    ClusterName = aws_ecs_cluster.websocket-cluster.name
  }
  treat_missing_data = "notBreaching"
  provider = aws.deployment-eu
}

# CloudWatch Alarm for ECS Request Count Scale Out (> 500)
resource "aws_cloudwatch_metric_alarm" "ecs_requests_scale_out" {
  alarm_name          = "ecs-bidding-requests-scale-out-${var.STAGE}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "RequestCountPerTarget"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Sum"
  threshold           = "25"
  alarm_description   = "Scale out when requests > 100 for 1 periods"
  alarm_actions       = [aws_appautoscaling_policy.ecs_request_scaling.arn, data.aws_sns_topic.ses_reputation_topic.arn]
  
  dimensions = {
    LoadBalancer = aws_lb.load-balancer.arn_suffix
    TargetGroup  = aws_lb_target_group.target_group.arn_suffix
  }
  provider = aws.deployment-eu
}

# CloudWatch Alarm for ECS Request Count Scale In (< 100)
resource "aws_cloudwatch_metric_alarm" "ecs_requests_scale_in" {
  alarm_name          = "ecs-bidding-requests-scale-in-${var.STAGE}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "15"
  metric_name         = "RequestCountPerTarget"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Average"
  threshold           = "90"
  alarm_description   = "Scale in when requests < 100 for 5 periods (25 minutes)"
  alarm_actions       = [aws_appautoscaling_policy.ecs_request_scaling.arn, data.aws_sns_topic.ses_reputation_topic.arn]
  
  dimensions = {
    LoadBalancer = aws_lb.load-balancer.arn_suffix
    TargetGroup  = aws_lb_target_group.target_group.arn_suffix
  }
  provider = aws.deployment-eu
}
