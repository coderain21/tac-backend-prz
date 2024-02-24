data "external" "env" {
  program = ["../envs.sh"]
}

  
#AWS Provider with profile main account
provider "aws" {
  region = data.external.env.result["REGION"]
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-main"
}



#AWS Provider with profile Stage account
provider "aws" {
  region = data.external.env.result["REGION"]
  alias = "deployment-eu"   # Specify a default AWS region here
  profile = "indyauction-${data.external.env.result["STAGE"]}"
}


data "aws_vpc" "default" {
  default = true
  provider = aws.deployment-eu
}

resource "aws_default_security_group" "default" {
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
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  provider = aws.deployment-eu
}



data "aws_acm_certificate" "existing_certificate" {
  domain   = data.external.env.result["CERTIFICATE_DOMAIN"]
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

resource "aws_iam_policy_attachment" "stepfunctions_full_access" {
  name       = "stepfunctions-full-access-attachment"
  roles      = [aws_iam_role.ecs_task_execution_role.name]
  policy_arn = "arn:aws:iam::aws:policy/AWSStepFunctionsFullAccess"
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
resource "aws_iam_policy_attachment" "stepfunctions_full_access_task_role" {
  name       = "stepfunctions-full-access-attachment"
  roles      = [aws_iam_role.ecs_task_role.name]
  policy_arn = "arn:aws:iam::aws:policy/AWSStepFunctionsFullAccess"
}

resource "aws_iam_role_policy_attachment" "ecs-task-execution-role-policy-attachment" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
  provider = aws.deployment-eu
}
resource "aws_iam_role_policy_attachment" "task_s3" {
  role       = "${aws_iam_role.ecs_task_role.name}"
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
  provider = aws.deployment-eu
}
# Attach CloudWatch Logs full access policy
resource "aws_iam_policy_attachment" "cloudwatch_logs_full_access_task_role" {
  name       = "cloudwatch-logs-full-access-attachment"
  roles      = [aws_iam_role.ecs_task_role.name]
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

# Attach CloudWatch full access policy
resource "aws_iam_policy_attachment" "cloudwatch_full_access_task_role" {
  name       = "cloudwatch-full-access-attachment"
  roles      = [aws_iam_role.ecs_task_role.name]
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchFullAccess"
}
# Attach CloudWatch Logs full access policy
resource "aws_iam_policy_attachment" "cloudwatch_logs_full_access_task_execution_role" {
  name       = "cloudwatch-logs-full-access-attachment"
  roles      = [aws_iam_role.ecs_task_execution_role.name]
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

# Attach CloudWatch full access policy
resource "aws_iam_policy_attachment" "cloudwatch_full_access_task_execution_role" {
  name       = "cloudwatch-full-access-attachment"
  roles      = [aws_iam_role.ecs_task_execution_role.name]
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchFullAccess"
}

# Security Group for loadbalancer
resource "aws_security_group" "websocket-security-group" {
  name        = "websocket-security-group"
  description = "Security Group for ECS and Load Balancer"
  vpc_id      = data.aws_vpc.default.id
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
  name = "websocket-cluster"
  provider = aws.deployment-eu
}
# ECR Repositories
resource "aws_ecr_repository" "repo1" {
  name = "websocket-repo"
  provider = aws.deployment-eu
}


resource "aws_ecs_task_definition" "websocket-task-definition" {
  family                   = "websocket-task-definition"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  task_role_arn            = resource.aws_iam_role.ecs_task_role.arn
  execution_role_arn       = resource.aws_iam_role.ecs_task_execution_role.arn
  cpu                      = "512"
  memory                   = "1024"
  depends_on = [resource.aws_ecs_cluster.websocket-cluster,resource.aws_ecr_repository.repo1]
  container_definitions = jsonencode([
    {
      name  = "websocket-container" ######change my container name
      image = "${aws_ecr_repository.repo1.repository_url}:latest", # Use the ECR repository URI
      portMappings = [
        {
          containerPort = 5000,
          hostPort      = 5000,
        }
      ]
      logConfiguration = {
        logDriver = "awslogs",
        options = {
          "awslogs-group"         = "/ecs/task",
          "awslogs-region"        = data.external.env.result["REGION"],
          "awslogs-create-group"  = "true",
          "awslogs-stream-prefix" = "ecs",
        },
      }
    }
  ])
  provider = aws.deployment-eu
}

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "map-public-ip-on-launch"
    values = ["true"]
  }
  provider = aws.deployment-eu
}


# Application Load Balancer (ALB) and Target Group
resource "aws_lb" "load-balancer" {
  name               = "web-socket-load-balancer"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.websocket-security-group.id]  # Security group for the Load Balancer
  subnets            = data.aws_subnets.public.ids

  enable_deletion_protection = false
  provider = aws.deployment-eu
}

data "aws_route53_zone" "domain_zone" {
  name = data.external.env.result["DOMAIN"] # Replace with your domain name
  provider = aws.main
}

resource "aws_route53_record" "my_cname" {
  name    = "${data.external.env.result["STAGE"]}-websocket.${data.external.env.result["DOMAIN"]}" # Replace with your desired CNAME
  type    = "A"
  zone_id = data.aws_route53_zone.domain_zone.zone_id  # Replace with your Route 53 hosted zone ID
  alias {
    name                   = aws_lb.load-balancer.dns_name
    zone_id                = aws_lb.load-balancer.zone_id
    evaluate_target_health = true
  }
  provider = aws.main
}

# Target Group
resource "aws_lb_target_group" "target_group" {
  name     = "target-group-websocket"
  port     = 80
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.default.id  # Use VPC ID from default VPC
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
  name            = "websocket-ecs-service"
  cluster         = resource.aws_ecs_cluster.websocket-cluster.id
  task_definition = resource.aws_ecs_task_definition.websocket-task-definition.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = data.aws_subnets.default.ids  # Fetch default subnets dynamically
    security_groups = [aws_default_security_group.default.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.target_group.arn
    container_name   = "websocket-container"
    container_port   = 5000
  }
  provider = aws.deployment-eu
}



output "subnet_cidr_blocks" {
  value = data.aws_subnets.public.ids
}

#output "default_vpc_ids" {
#  value = data.aws_vpc.default.id
#}