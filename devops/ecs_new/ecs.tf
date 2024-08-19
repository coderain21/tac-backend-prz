
data "external" "env" {
  program = ["./envs.sh"]
}
#AWS Provider with profile main account
provider "aws" {
  region = var.REGION
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}
#AWS Provider with profile Stage account
provider "aws" {
  region = var.REGION
  alias = "deployment-eu"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}


provider "aws" {
  region = "us-east-1"
  alias = "route53-account"   # Specify a default AWS region here
  profile = "${var.ROUTE53_ACCOUNT}"
}

data "aws_ssm_parameter" "subnet_id" {
  name = "PUBLIC_SUBNET_ID"
  provider = aws.deployment-eu
}
data "aws_ssm_parameter" "vpc_id" {
  name     = "VPC_ID"
  provider = aws.deployment-eu
}
locals {
  sub_domain = var.STAGE == "prod" ? var.DOMAIN : "${var.STAGE}.${var.DOMAIN}"
}

data "aws_vpc" "default" {
  default = true
  provider = aws.deployment-eu
}


data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_ssm_parameter.vpc_id.value]
  }
  provider = aws.deployment-eu
}





data "aws_acm_certificate" "existing_certificate" {
  domain   = "*.${local.sub_domain}"
  statuses = ["ISSUED", "PENDING_VALIDATION"] # Specify certificate statuses you want to consider as "existing"
  provider = aws.deployment-eu
}



resource "aws_iam_role" "ecs_task_execution_role" {
  name = "new-ecs-task-execution-role"
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
  name = "new-ecs-task-role"
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



resource "aws_security_group" "new-websocket-security-group" {
  name        = "new-websocket-security-group"
  description = "Security Group for ECS and Load Balancer"
  vpc_id      = data.aws_ssm_parameter.vpc_id.value
  provider = aws.deployment-eu

  # Inbound rules
  ingress {
    from_port = 6379
    to_port   = 6379
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port = 80
    to_port   = 80
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port = 11211
    to_port   = 11211
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port = 8080
    to_port   = 8080
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port = 22
    to_port   = 22
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port = 0
    to_port   = 65535
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port = 443
    to_port   = 443
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound rules (allow all traffic)
  egress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "websocket-cluster" {
  name = "new-websocket-cluster"
  provider = aws.deployment-eu
}
# ECR Repositories
resource "aws_ecr_repository" "repo1" {
  name = "new-websocket-repo"
  provider = aws.deployment-eu
  force_delete = true
}

########################



locals {
  definitions = jsonencode([
    {
      name      = "new-websocket-container"
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
}
data "aws_ssm_parameter" "memory" {
  name = "MEMORY"
}

resource "aws_ecs_task_definition" "websocket-task-definition" {
  family                   = "new-websocket-task-definition"
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
    values = [data.aws_ssm_parameter.vpc_id.value]
  }
  filter {
    name   = "map-public-ip-on-launch"
    values = ["true"]
  }
  provider = aws.deployment-eu
}


# Application Load Balancer (ALB) and Target Group
resource "aws_lb" "load-balancer" {
  name               = "new-web-socket-load-balancer"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.new-websocket-security-group.id]  # Security group for the Load Balancer
  subnets            = data.aws_subnets.public.ids

  enable_deletion_protection = false
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
  name     = "new-target-group-websocket"
  port     = 80
  protocol = "HTTP"
  vpc_id   = data.aws_ssm_parameter.vpc_id.value  # Use VPC ID from default VPC
  target_type = "ip"
  provider = aws.deployment-eu
}

# Listener Rule

# Listener
resource "aws_lb_listener" "listener" {
  load_balancer_arn = aws_lb.load-balancer.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = data.aws_acm_certificate.existing_certificate.arn

  default_action {
    type             = "forward"
      target_group_arn = aws_lb_target_group.target_group.arn
  }
  provider = aws.deployment-eu
}


resource "aws_ecs_service" "ecs_service" {
  name            = "new-websocket-ecs-service"
  cluster         = resource.aws_ecs_cluster.websocket-cluster.id
  task_definition = resource.aws_ecs_task_definition.websocket-task-definition.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = [data.aws_ssm_parameter.subnet_id.value]  # Fetch default subnets dynamically
    security_groups = [aws_security_group.new-websocket-security-group.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.target_group.arn
    container_name   = "new-websocket-container"
    container_port   = 5000
  }
  provider = aws.deployment-eu
}

resource "aws_appautoscaling_target" "target" {
  max_capacity = 5
  min_capacity = 1
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

    target_value = 70
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


