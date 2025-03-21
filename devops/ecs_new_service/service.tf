data "external" "env" {
  program = ["./envs.sh"]
}


provider "aws" {
  region  = var.REGION
  alias   = "deployment-eu"
  profile = "indyauction-${var.STAGE}"
}

terraform {
  backend "s3" {
    region       = "eu-west-2"  # Replace with the appropriate AWS region
    encrypt      = true
    use_lockfile = true  # Enable the S3 locking feature
  }
}

data "aws_vpc" "my_vpc" {
  # Use the "Name" tag filter to find the VPC by name
  filter {
    name   = "tag:Name"
    values = ["new-vpc"]
  }
  provider = aws.deployment-eu
}



resource "aws_ecr_repository" "repo1" {
  name         = "ecs-bidding-engine-repo"
  provider     = aws.deployment-eu
  force_delete = true
}

locals {
  definitions = jsonencode([
    {
      name      = "bidding-engine-container"
      image     = "${aws_ecr_repository.repo1.repository_url}:latest"
      cpu       = 0
      essential = true
      portMappings = [
        {
          containerPort = 27016
          protocol      = "tcp"
          hostPort      = 27016
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
          awslogs-group        = "/ecs/task/bidding"
          awslogs-region       = "${var.REGION}"
          awslogs-stream-prefix= "ecs"
        }
      }
    }
  ])
}

data "aws_iam_role" "ecs_task_role" {
  name = "ecs-task-role-new"
}

data "aws_iam_role" "ecs_task_execution_role" {
  name = "ecs-task-execution-role-new"
}


data "aws_security_group" "new_websocket_security_group" {
  name = "new-websocket-security-group"
}

data "aws_subnets" "new-public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.my_vpc.id]
  }
  filter {
    name   = "map-public-ip-on-launch"
    values = ["true"]
  }
  provider = aws.deployment-eu
}


resource "aws_ecs_task_definition" "bidding-engine-task-definition" {
  family                   = "bidding-engine-task-definition"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  task_role_arn            = aws_iam_role.ecs_task_role.arn
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  cpu                      = 512
  memory                   = 1024

  container_definitions = local.definitions
  provider              = aws.deployment-eu
}


data "aws_ssm_parameter" "subnet_id" {
  name = "SUBNET_ID"
  provider = aws.deployment-eu
}
 
data "aws_ecs_cluster" "ecs" {
  cluster_name = "websocket-cluster"
  provider = aws.deployment-eu
}

# Application Load Balancer (ALB) and Target Group
resource "aws_lb" "new-load-balancer" {
  name               = "web-soc-load-balancer-new"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.new-websocket-security-group.id]  # Security group for the Load Balancer
  subnets            = data.aws_subnets.new-public.ids

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
    name                   = aws_lb.new-load-balancer.dns_name
    zone_id                = aws_lb.new-load-balancer.zone_id
    evaluate_target_health = true
  }
  provider = aws.route53-account
}



resource "aws_lb_target_group" "new_target_group" {
  name     = "new-target-group-websocket"
  port     = 80
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.my_vpc.id  # Use VPC ID from default VPC
  target_type = "ip"
  provider = aws.deployment-eu
}

# Listener Rule

# Listener
resource "aws_lb_listener" "listener" {
  load_balancer_arn = aws_lb.new-load-balancer.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = data.aws_acm_certificate.existing_certificate.arn

  default_action {
    type             = "forward"
      target_group_arn = aws_lb_target_group.new_target_group.arn
  }
  provider = aws.deployment-eu
}

resource "aws_ecs_service" "ecs_service" {
  name            = "bidding-engine-ecs-service"
  cluster         = data.aws_ecs_cluster.ecs.id
  task_definition = aws_ecs_task_definition.bidding-engine-task-definition.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = [data.aws_ssm_parameter.subnet_id.value]
    security_groups = [aws_security_group.bidding-engine-security-group.id]
    assign_public_ip = false # Do not assign public IP
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.bidding-engine_tg.arn
    container_name   = "bidding-engine-container"
    container_port   = 27016
  }

  provider = aws.deployment-eu
}





resource "aws_ssm_parameter" "repository_url" {
  name      = "BIDDING_ENGINE_DOCKER_IMAGE"
  type      = "String"
  value     = "${aws_ecr_repository.repo1.repository_url}:latest"
  provider  = aws.deployment-eu
  overwrite = true 
}

resource "aws_ssm_parameter" "repository_name" {
  name      = "BIDDING_ENGINE_ECR_REPO_NAME"
  type      = "String"
  value     = aws_ecr_repository.repo1.name
  overwrite = true
  provider  = aws.deployment-eu
}

resource "aws_ssm_parameter" "ecr_repository_url" {
  name      = "BIDDING_ENGINE_ECR_REPO_URI"
  type      = "String"
  value     = "${aws_ecr_repository.repo1.repository_url}"
  overwrite = true
  provider  = aws.deployment-eu
}

resource "aws_ssm_parameter" "bidding_engine_ecs_service_name" {
  name      = "BIDDING_ENGINE_ECS_SERVICE_NAME"
  type      = "String"
  value     = "bidding-engine-ecs-service"
  overwrite = true
  provider  = aws.deployment-eu
}
resource "aws_ssm_parameter" "ecs_cluster_name" {
  name      = "ECS_CLUSTER_NAME"
  type      = "String"
  value     = "websocket-cluster"
  overwrite = true
  provider  = aws.deployment-eu
}