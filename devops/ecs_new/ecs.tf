
data "external" "env" {
  program = ["./envs.sh"]
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

data "aws_vpc" "my_vpc" {
  # Use the "Name" tag filter to find the VPC by name
  filter {
    name   = "tag:Name"
    values = ["new-vpc"]
  }
  provider = aws.deployment-eu
}



resource "aws_security_group" "ecs-security-group" {
  name        = "ecs-security-group-new"
  description = "Security Group for ECS"
  vpc_id = data.aws_vpc.my_vpc.id
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


data "aws_subnet" "default_az1" {
  filter {
    name   = "availability-zone"
    values = ["eu-west-2c"]
  }

  # Add this filter to specify the VPC ID
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.my_vpc.id]  # Reference to your VPC data source
  }

  filter {
    name   = "tag:Name"
    values = ["public-subnet-c"]
  }

  provider = aws.deployment-eu
}


resource "aws_default_subnet" "default_az1" {
  availability_zone = "eu-west-2c"
  provider = aws.deployment-eu
}




data "aws_acm_certificate" "existing_certificate" {
  domain   = "*.${local.sub_domain}"
  statuses = ["ISSUED", "PENDING_VALIDATION"] # Specify certificate statuses you want to consider as "existing"
  provider = aws.deployment-eu
}



resource "aws_iam_role" "ecs_task_execution_role" {
  name = "ecs-task-execution-role-new"
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
  name = "ecs-task-role-new"
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

# Attach Autoscaling policy
resource "aws_iam_role_policy_attachment" "ECS_autoscaling_policy" {
  role     = "${aws_iam_role.ecs_task_role.name}"
  policy_arn = "arn:aws:iam::149706502537:policy/ECS_autoscaling_policy"
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

# Security Group for loadbalancer


resource "aws_security_group" "new-websocket-security-group" {
  name        = "new-websocket-security-group"
  description = "New Security Group for ECS and Load Balancer"
  vpc_id      = data.aws_vpc.my_vpc.id
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
  name = "websocket-repo-new"
  provider = aws.deployment-eu
  force_delete = true
}
# ECR Repositories
resource "aws_ecr_repository" "repo" {
  name = "update-auction-repo"
  provider = aws.deployment-eu
  force_delete = true
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

resource "aws_ecs_task_definition" "new-websocket-task-definition" {
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
  name            = "websocket-ecs-service-new"
  cluster         = resource.aws_ecs_cluster.websocket-cluster.id
  task_definition = resource.aws_ecs_task_definition.new-websocket-task-definition.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = [data.aws_subnet.default_az1.id]  # Fetch default subnets dynamically
    security_groups = [aws_security_group.ecs-security-group.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.new_target_group.arn
    container_name   = "websocket-container"
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

