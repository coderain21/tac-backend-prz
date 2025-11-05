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
  is_dev_preprod = contains(["dev", "pre-production"], var.STAGE)
  is_bidding = var.STAGE == "bidding-engine"
  
  # Resource name suffixes based on stage
  role_suffix = local.is_dev_preprod ? "-new" : ""
  cluster_name = "websocket-cluster"
  ecr_repo_name = local.is_dev_preprod ? "websocket-repo-new" : "websocket-repo"
  lb_name = local.is_dev_preprod ? "web-soc-load-balancer-new" : "web-socket-load-balancer"
  sg_name = local.is_dev_preprod ? "new-websocket-security-group" : "websocket-security-group"
  tg_name = local.is_dev_preprod ? "new-target-group-websocket" : "target-group-websocket"
  service_name = local.is_dev_preprod ? "websocket-ecs-service-new" : "websocket-ecs-service"
  task_def_name = local.is_dev_preprod ? "new-websocket-task-definition" : "websocket-task-definition"
}

data "aws_vpc" "default" {
  default = true
  provider = aws.deployment-eu
}

data "aws_vpc" "custom" {
  count = local.is_dev_preprod ? 1 : 0
  filter {
    name   = "tag:Name"
    values = ["new-vpc"]
  }
  provider = aws.deployment-eu
}

# Subnet Data Sources
data "aws_subnet" "custom_subnet" {
  count = local.is_dev_preprod ? 1 : 0
  filter {
    name   = "availability-zone"
    values = ["eu-west-2c"]
  }
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.custom[0].id]
  }
  filter {
    name   = "tag:Name"
    values = ["public-subnet-c"]
  }
  provider = aws.deployment-eu
}

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [local.is_dev_preprod ? data.aws_vpc.custom[0].id : data.aws_vpc.default.id]
  }
  filter {
    name   = "map-public-ip-on-launch"
    values = ["true"]
  }
  provider = aws.deployment-eu
}

# SSM Parameters for bidding engine
data "aws_ssm_parameter" "subnet" {
  count = local.is_bidding ? 1 : 0
  name = "SUBNET_ID_PUBLIC"
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "security_group" {
  count = local.is_bidding ? 1 : 0
  name = "SECURITY_GROUP_ID"
  provider = aws.deployment-eu
}

# Default Subnets
resource "aws_default_subnet" "default_az1" {
  availability_zone = local.is_bidding ? "eu-west-2a" : "eu-west-2c"
  provider = aws.deployment-eu
}

# Security Groups
resource "aws_default_security_group" "default" {
  count = !local.is_dev_preprod ? 1 : 0
  vpc_id = data.aws_vpc.default.id
  provider = aws.deployment-eu

  ingress {
    from_port   = 27017
    to_port     = 27017
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1" # "-1" represents all protocols
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1" # "-1" represents all protocols
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs_security_group" {
  count = local.is_dev_preprod ? 1 : 0
  name        = "ecs-security-group-new"
  description = "Security Group for ECS"
  vpc_id = data.aws_vpc.custom[0].id
  provider = aws.deployment-eu

  ingress {
    from_port   = 27017
    to_port     = 27017
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow MongoDB access from anywhere"
  }

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all ingress traffic from anywhere"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }
}

resource "aws_security_group" "websocket-security-group" {
  name        = local.sg_name
  description = "Security Group for ECS and Load Balancer"
  vpc_id      = local.is_dev_preprod ? data.aws_vpc.custom[0].id : data.aws_vpc.default.id
  provider = aws.deployment-eu

  lifecycle {
    ignore_changes = [description, ingress, egress]
  }
}

data "aws_acm_certificate" "existing_certificate" {
  domain   = "*.${local.sub_domain}"
  statuses = ["ISSUED", "PENDING_VALIDATION"]
  provider = aws.deployment-eu
}

# IAM Roles
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "ecs-task-execution-role${local.role_suffix}"
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

resource "aws_iam_role" "ecs_task_role" {
  name = "ecs-task-role${local.role_suffix}"
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

# IAM Role Policy Attachments
resource "aws_iam_role_policy_attachment" "stepfunctions_full_access" {
  role      = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSStepFunctionsFullAccess"
  provider = aws.deployment-eu
}

resource "aws_iam_role_policy_attachment" "stepfunctions_full_access_task_role" {
  role      = aws_iam_role.ecs_task_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSStepFunctionsFullAccess"
  provider = aws.deployment-eu
}



resource "aws_iam_role_policy_attachment" "task_s3" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
  provider = aws.deployment-eu
}
# Attach CloudWatch Logs full access policy
resource "aws_iam_role_policy_attachment" "cloudwatch_logs_full_access_task_role" {
  role      = aws_iam_role.ecs_task_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
  provider = aws.deployment-eu
}

# Attach CloudWatch full access policy
resource "aws_iam_role_policy_attachment" "cloudwatch_full_access_task_role" {
  role     = aws_iam_role.ecs_task_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchFullAccess"
  provider = aws.deployment-eu
}
# Attach CloudWatch Logs full access policy
resource "aws_iam_role_policy_attachment" "cloudwatch_logs_full_access_task_execution_role" {
  role      = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
  provider = aws.deployment-eu
}

# Attach CloudWatch full access policy
resource "aws_iam_role_policy_attachment" "cloudwatch_full_access_task_execution_role" {
  role      = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchFullAccess"
  provider = aws.deployment-eu
}
resource "aws_iam_role_policy_attachment" "ecs-task-execution-role-policy-attachment" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
  provider = aws.deployment-eu
}

# ECS Cluster
resource "aws_ecs_cluster" "websocket-cluster" {
  name = local.cluster_name
  provider = aws.deployment-eu
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}
# ECR Repositories
resource "aws_ecr_repository" "repo1" {
  name = local.ecr_repo_name
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

# Task Definition
locals {
  definitions = jsonencode([
    {
      name      = "websocket-container"
      image     = "${aws_ecr_repository.repo1.repository_url}:latest"
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
  family                   = local.task_def_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  task_role_arn            = aws_iam_role.ecs_task_role.arn
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  cpu                      = data.aws_ssm_parameter.cpu.value
  memory                   = data.aws_ssm_parameter.memory.value
  depends_on = [aws_ecs_cluster.websocket-cluster, aws_ecr_repository.repo1]
  container_definitions = local.definitions
  skip_destroy = true
  provider = aws.deployment-eu
}

# Load Balancer
resource "aws_lb" "load-balancer" {
  name               = local.lb_name
  internal           = false
  load_balancer_type = "application"
  security_groups    = local.is_bidding ? [data.aws_ssm_parameter.security_group[0].value] : [aws_security_group.websocket-security-group.id]
  subnets            = local.is_bidding ? [data.aws_ssm_parameter.subnet[0].value, aws_default_subnet.default_az1.id] : data.aws_subnets.public.ids

  enable_deletion_protection = true
  provider = aws.deployment-eu
}


data "aws_route53_zone" "domain_zone" {
  name = local.sub_domain
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
  name     = local.tg_name
  port     = 80
  protocol = "HTTP"
  vpc_id   = local.is_dev_preprod ? data.aws_vpc.custom[0].id : data.aws_vpc.default.id
  target_type = "ip"
  health_check {
    enabled             = true
    interval            = 30
    path                = "/"
    timeout             = 5
    healthy_threshold   = 5
    unhealthy_threshold = 2
    matcher             = "200"
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
  name            = local.service_name
  cluster         = aws_ecs_cluster.websocket-cluster.id
  task_definition = aws_ecs_task_definition.websocket-task-definition.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = local.is_bidding ? [data.aws_ssm_parameter.subnet[0].value] : (local.is_dev_preprod ? [data.aws_subnet.custom_subnet[0].id] : [aws_default_subnet.default_az1.id])
    security_groups = local.is_bidding ? [data.aws_ssm_parameter.security_group[0].value] : (local.is_dev_preprod ? [aws_security_group.ecs_security_group[0].id] : [aws_default_security_group.default[0].id])
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.target_group.arn
    container_name   = "websocket-container"
    container_port   = 5000
  }
  provider = aws.deployment-eu
}

# Auto Scaling
resource "aws_appautoscaling_target" "target" {
  max_capacity = 10
  min_capacity = 2
  resource_id = "service/${aws_ecs_cluster.websocket-cluster.name}/${aws_ecs_service.ecs_service.name}"
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

# Request Count Policy (only for bidding engine)
resource "aws_appautoscaling_policy" "request_count" {
  count = local.is_bidding ? 1 : 0
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
    target_value = 1000
    scale_out_cooldown = 300
    scale_in_cooldown = 300
  }
  provider = aws.deployment-eu
}

# SSM Parameters
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
  value = aws_ecr_repository.repo1.repository_url
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

# WAF Association (prod only)
data "aws_ssm_parameter" "waf_web_acl" {
  count = var.STAGE == "prod" ? 1 : 0
  name ="SECURE_API_WEB_ACL_ARN"
  provider = aws.deployment-eu
}

resource "aws_wafv2_web_acl_association" "web_acl_association" {
  count = var.STAGE == "prod" ? 1 : 0
  web_acl_arn = data.aws_ssm_parameter.waf_web_acl[0].value
  resource_arn = aws_lb.load-balancer.arn
  provider = aws.deployment-eu
}

# CloudWatch Alarms and Step Scaling
data "aws_sns_topic" "ses_reputation_topic" {
  name = "SESReputationTopic"
  provider = aws.deployment-eu
}

resource "aws_appautoscaling_policy" "ecs_cpu_scaling" {
  name               = "ecs-${local.is_bidding ? "bidding-" : (local.is_dev_preprod ? "new-" : "")}cpu-scaling-${var.STAGE}"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.target.resource_id
  scalable_dimension = aws_appautoscaling_target.target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.target.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown               = local.is_dev_preprod ? 60 : 300
    metric_aggregation_type = "Average"

    step_adjustment {
      metric_interval_lower_bound = 0
      metric_interval_upper_bound = local.is_dev_preprod ? 20 : null
      scaling_adjustment          = 1
    }
    
    dynamic "step_adjustment" {
      for_each = local.is_dev_preprod ? [1] : []
      content {
        metric_interval_lower_bound = 20
        scaling_adjustment          = 2
      }
    }
    
    step_adjustment {
      metric_interval_upper_bound = 0
      scaling_adjustment          = -1
    }
  }
  provider = aws.deployment-eu
}

resource "aws_appautoscaling_policy" "ecs_memory_target_scaling" {
  name               = "ecs-${local.is_bidding ? "bidding-" : (local.is_dev_preprod ? "new-" : "")}memory-scaling-${var.STAGE}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.target.resource_id
  scalable_dimension = aws_appautoscaling_target.target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }

    target_value       = 50               # keep average memory usage ~65%
    scale_in_cooldown  = 60                # wait 1 min before scaling in
    scale_out_cooldown = 30                # scale out quickly when needed
  }

  provider = aws.deployment-eu
}
resource "aws_appautoscaling_policy" "ecs_cpu_target_scaling" {
  name               = "ecs-${local.is_bidding ? "bidding-" : (local.is_dev_preprod ? "new-" : "")}memory-scaling-${var.STAGE}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.target.resource_id
  scalable_dimension = aws_appautoscaling_target.target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }

    target_value       = 50               # keep average memory usage ~65%
    scale_in_cooldown  = 60                # wait 1 min before scaling in
    scale_out_cooldown = 30                # scale out quickly when needed
  }

  provider = aws.deployment-eu
}

resource "aws_appautoscaling_policy" "ecs_memory_scaling" {
  name               = "ecs-${local.is_bidding ? "bidding-" : (local.is_dev_preprod ? "new-" : "")}memory-scaling-${var.STAGE}"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.target.resource_id
  scalable_dimension = aws_appautoscaling_target.target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.target.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown               = local.is_dev_preprod ? 60 : 300
    metric_aggregation_type = "Average"

    step_adjustment {
      metric_interval_lower_bound = 0
      metric_interval_upper_bound = local.is_dev_preprod ? 15 : null
      scaling_adjustment          = 1
    }
    
    dynamic "step_adjustment" {
      for_each = local.is_dev_preprod ? [1] : []
      content {
        metric_interval_lower_bound = 15
        scaling_adjustment          = 2
      }
    }
    
    step_adjustment {
      metric_interval_upper_bound = 0
      scaling_adjustment          = -1
    }
  }
  provider = aws.deployment-eu
}

resource "aws_appautoscaling_policy" "ecs_request_scaling" {
  name               = "ecs-${local.is_bidding ? "bidding-" : (local.is_dev_preprod ? "new-" : "")}request-scaling-${var.STAGE}"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.target.resource_id
  scalable_dimension = aws_appautoscaling_target.target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.target.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown               = 60
    metric_aggregation_type = "Average"

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

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_scale_out" {
  alarm_name          = "ecs-${local.is_bidding ? "bidding-" : ""}cpu-scale-out-${var.STAGE}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Maximum"
  threshold           = data.aws_ssm_parameter.ecs_cpu.value   # Scale at 70% Memory
  alarm_description   = "Scale out when CPU > 70% for 1 minute"
  alarm_actions       = [aws_appautoscaling_policy.ecs_cpu_scaling.arn, data.aws_sns_topic.ses_reputation_topic.arn]
  
  dimensions = {
    ServiceName = aws_ecs_service.ecs_service.name
    ClusterName = aws_ecs_cluster.websocket-cluster.name
  }
  provider = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_scale_in" {
  alarm_name          = "ecs-${local.is_bidding ? "bidding-" : ""}cpu-scale-in-${var.STAGE}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Average"
  threshold           = "30"
  alarm_description   = "Scale in when CPU < 30% for 3 minutes"
  alarm_actions       = [aws_appautoscaling_policy.ecs_cpu_scaling.arn, data.aws_sns_topic.ses_reputation_topic.arn]
  
  dimensions = {
    ServiceName = aws_ecs_service.ecs_service.name
    ClusterName = aws_ecs_cluster.websocket-cluster.name
  }
  provider = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory_scale_out" {
  alarm_name          = "ecs-${local.is_bidding ? "bidding-" : ""}memory-scale-out-${var.STAGE}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Maximum"
  threshold           = data.aws_ssm_parameter.ecs_memory.value   # Scale at 70% Memory
  alarm_description   = "Scale out when Memory > 70% for 1 minute"
  alarm_actions       = [aws_appautoscaling_policy.ecs_memory_scaling.arn, data.aws_sns_topic.ses_reputation_topic.arn]
  
  dimensions = {
    ServiceName = aws_ecs_service.ecs_service.name
    ClusterName = aws_ecs_cluster.websocket-cluster.name
  }
  provider = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory_scale_in" {
  alarm_name          = "ecs-${local.is_bidding ? "bidding-" : ""}memory-scale-in-${var.STAGE}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Average"
  threshold           = "30"
  alarm_description   = "Scale in when Memory < 30% for 3 minutes"
  alarm_actions       = [aws_appautoscaling_policy.ecs_memory_scaling.arn, data.aws_sns_topic.ses_reputation_topic.arn]
  
  dimensions = {
    ServiceName = aws_ecs_service.ecs_service.name
    ClusterName = aws_ecs_cluster.websocket-cluster.name
  }
  provider = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "ecs_requests_scale_out" {
  alarm_name          = "ecs-${local.is_bidding ? "bidding-" : ""}requests-scale-out-${var.STAGE}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "RequestCountPerTarget"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Maximum"
  threshold           = "100"
  alarm_description   = "Scale out when requests > 100 for 1 minute"
  alarm_actions       = [aws_appautoscaling_policy.ecs_request_scaling.arn, data.aws_sns_topic.ses_reputation_topic.arn]
  
  dimensions = {
    LoadBalancer = aws_lb.load-balancer.arn_suffix
    TargetGroup  = aws_lb_target_group.target_group.arn_suffix
  }
  provider = aws.deployment-eu
}

resource "aws_cloudwatch_metric_alarm" "ecs_requests_scale_in" {
  alarm_name          = "ecs-${local.is_bidding ? "bidding-" : ""}requests-scale-in-${var.STAGE}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "15"
  metric_name         = "RequestCountPerTarget"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Average"
  threshold           = "50"
  alarm_description   = "Scale in when requests < 50 for 15 minutes"
  alarm_actions       = [aws_appautoscaling_policy.ecs_request_scaling.arn, data.aws_sns_topic.ses_reputation_topic.arn]
  
  dimensions = {
    LoadBalancer = aws_lb.load-balancer.arn_suffix
    TargetGroup  = aws_lb_target_group.target_group.arn_suffix
  }
  provider = aws.deployment-eu
}
