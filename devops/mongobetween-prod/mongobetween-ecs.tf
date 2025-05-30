data "external" "env" {
  program = ["./envs.sh"]
}


provider "aws" {
  region  = var.REGION
  alias   = "deployment-eu"
  profile = "indyauction-${var.STAGE}"
}

data "aws_vpc" "default" {
  default = true
  provider = aws.deployment-eu
}

terraform {
  backend "s3" {
    region       = "eu-west-2"  # Replace with the appropriate AWS region
    encrypt      = true
    use_lockfile = true  # Enable the S3 locking feature
  }
}

terraform {
  required_providers {
   aws = {
    source  = "hashicorp/aws"
    version = "5.98"
    }
  }
}

resource "aws_iam_role" "ecs_task_execution_role" {
  name               = "ecs-mongobetween-task-execution-role"
  provider           = aws.deployment-eu
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
   }
 ]
}
EOF
}

resource "aws_iam_role" "ecs_task_role" {
  name               = "ecs-mongobetween-task-role"
  provider           = aws.deployment-eu
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
   }
 ]
}
EOF
}

resource "aws_iam_role_policy_attachment" "cloudwatch_logs_full_access_task_role" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
  provider   = aws.deployment-eu
}

resource "aws_iam_role_policy_attachment" "cloudwatch_logs_full_access_task_execution_role" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
  provider   = aws.deployment-eu
}

resource "aws_iam_role_policy_attachment" "ecs-task-execution-role-policy-attachment" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
  provider   = aws.deployment-eu
}

# Attach ECR Access policy to ECS task execution role
resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_ecr" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  provider   = aws.deployment-eu
}

resource "aws_security_group" "mongobetween-security-group" {
  name        = "mongobetween-security-group"
  description = "Security Group for mongobetween ECS"
  vpc_id      = data.aws_vpc.default.id
  provider    = aws.deployment-eu

  # Allow incoming traffic on port 27017 from the CIDR block of your choice
  ingress {
    from_port   = 27017
    to_port     = 27017
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Restrict to VPC CIDR
  }
  ingress {
    from_port   = 27016
    to_port     = 27016
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Restrict to VPC CIDR
  }

  # Allow outgoing traffic to any port
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_ecr_repository" "repo1" {
  name         = "mongobetween"
  provider     = aws.deployment-eu
  force_delete = true
}

locals {
  definitions = jsonencode([
    {
      name      = "mongobetween-container"
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
          awslogs-group        = "/ecs/task/mongobetweengo"
          awslogs-region       = "${var.REGION}"
          awslogs-stream-prefix= "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_task_definition" "mongobetween-task-definition" {
  family                   = "mongobetween-task-definition"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  task_role_arn            = aws_iam_role.ecs_task_role.arn
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  cpu                      = 512
  memory                   = 1024

  container_definitions = local.definitions
  provider              = aws.deployment-eu
}


data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "map-public-ip-on-launch"
    values = ["false"]
  }
  provider = aws.deployment-eu
}

 
data "aws_ecs_cluster" "ecs" {
  cluster_name = "websocket-cluster"
  provider = aws.deployment-eu
}

resource "aws_lb" "mongobetween_nlb" {
  name               = "mongobetween-nlb"
  internal           = true # Set to true for internal NLB
  load_balancer_type = "network"
  subnets            = data.aws_subnets.private.ids
  provider           = aws.deployment-eu
}

resource "aws_lb_target_group" "mongobetween_tg" {
  name        = "mongobetween-tg"
  port        = 27016
  protocol    = "TCP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"
  provider    = aws.deployment-eu
}

resource "aws_lb_listener" "listener" {
  load_balancer_arn = aws_lb.mongobetween_nlb.arn
  port              = 27016
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mongobetween_tg.arn
  }
  provider = aws.deployment-eu
}

resource "aws_ecs_service" "ecs_service" {
  name            = "mongobetween-ecs-service"
  cluster         = data.aws_ecs_cluster.ecs.id
  task_definition = aws_ecs_task_definition.mongobetween-task-definition.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = data.aws_subnets.private.ids
    security_groups = [aws_security_group.mongobetween-security-group.id]
    assign_public_ip = false # Do not assign public IP
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.mongobetween_tg.arn
    container_name   = "mongobetween-container"
    container_port   = 27016
  }

  provider = aws.deployment-eu
}


data "aws_ssm_parameter" "mongo_password" {
  name = "MONGO_PASSWORD"
  provider = aws.deployment-eu
}

resource "aws_ssm_parameter" "socket" {
  name      = "MONGOBETWEEN_CONNECTION_STRING"
  type      = "String"
  value     = "mongodb://indyauctionAdmin:${data.aws_ssm_parameter.mongo_password.value}@${aws_lb.mongobetween_nlb.dns_name}:27016/${var.STAGE}?authMechanism=SCRAM-SHA-1&authSource=${var.STAGE}&retryWrites=false"
  provider  = aws.deployment-eu
  overwrite = true
}


resource "aws_ssm_parameter" "repository_url" {
  name      = "MONGOBETWEEN_DOCKER_IMAGE"
  type      = "String"
  value     = "${aws_ecr_repository.repo1.repository_url}:latest"
  provider  = aws.deployment-eu
  overwrite = true 
}

resource "aws_ssm_parameter" "repository_name" {
  name      = "MONGOBETWEEN_ECR_REPO_NAME"
  type      = "String"
  value     = aws_ecr_repository.repo1.name
  overwrite = true
  provider  = aws.deployment-eu
}

resource "aws_ssm_parameter" "ecr_repository_url" {
  name      = "MONGOBETWEEN_ECR_REPO_URI"
  type      = "String"
  value     = "${aws_ecr_repository.repo1.repository_url}"
  overwrite = true
  provider  = aws.deployment-eu
}

resource "aws_ssm_parameter" "mongobetween_ecs_service_name" {
  name      = "MONGOBETWEEN_ECS_SERVICE_NAME"
  type      = "String"
  value     = "mongobetween-ecs-service"
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