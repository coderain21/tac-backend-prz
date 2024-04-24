 

  
#AWS Provider with profile main account
provider "aws" {
  region = var.REGION
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-main"
}
#AWS Provider with profile Stage account
provider "aws" {
  region = var.REGION
  alias = "deployment-eu"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

locals {
  sub_domain = var.STAGE == "prod" ? var.DOMAIN : "${var.STAGE}.${var.DOMAIN}"
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
  force_delete = true
}

########################

# data "aws_s3_bucket_object" "my_objects" {
#   bucket = "ecs-deployment-bucket"
#   key = "ecr-credential/task-definition.json"
#   provider = aws.deployment-eu
# }

locals {
  datafile       = [
    {
      "name": "websocket-container",
      "image": "${resource.aws_ecr_repository.repo1.repository_url}:latest",
      "cpu": 0,
      "portMappings": [
        {
          "containerPort": 5000,
          "hostPort": 5000,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "environment": [
        {
          "name": "STATE_MACHINE_LOT_ARN",
          "value": "arn:aws:states:eu-west-2:539631565926:stateMachine:qa-lot-published"
        },
        {
          "name": "BUYER_COGNITO_USERPOOL_ID",
          "value": "eu-west-2_eRopiooUh"
        },
        {
          "name": "STAGE",
          "value": "qa"
        },
        {
          "name": "WEB_PUSH_ACCESS_KEY",
          "value": "BA3rSGSik3c8-pT1tspVZdvESBJlPs8Jk9kJJbwAV618yVlZZtgDwV5VLVsfC06IJ2L9IpfPRSD-riXOHKUyyro"
        },
        {
          "name": "REDIS_CONNECTION_URL",
          "value": "redis://websocket-redis.afgucd.ng.0001.euw2.cache.amazonaws.com:6379"
        },
        {
          "name": "WEB_PUSH_SECRET_KEY",
          "value": "qE9SJ9dbfZxGdE3jAw0NVHhGrGAhkjTNluvGltiUhNQ"
        },
        {
          "name": "MONGODB_CONNECTION_STRING",
          "value": "mongodb://indyauctionmaster:masterindyauction@qa.cluster-cw1tmmuhdd7j.eu-west-2.docdb.amazonaws.com:27017/qa?authMechanism=SCRAM-SHA-1&authSource=qa&retryWrites=false"
        },
        {
          "name": "REDIS_URL",
          "value": "redis://websocket-redis.afgucd.ng.0001.euw2.cache.amazonaws.com:6379"
        },
        {
          "name": "REGION",
          "value": "eu-west-2"
        },
        {
          "name": "ADMIN_S3_BUCKET",
          "value": "indyauction-admin-web-application-qa"
        },
        {
          "name": "BUYER_COGNITO_USERPOOL_DOMAIN",
          "value": "auth.www-qa.indyauction.net"
        },
        {
          "name": "COMMON_LIB_ARN",
          "value": "arn:aws:lambda:eu-west-2:539631565926:layer:node_dependency:162"
        },
        {
          "name": "COMMON_LIB_ARN_PYTHON",
          "value": "arn:aws:lambda:eu-west-2:539631565926:layer:python-dependency-qa:138"
        },
        {
          "name": "COMMON_LIB_ARN_PYTHON_2",
          "value": "arn:aws:lambda:eu-west-2:539631565926:layer:python-dependency-2-qa:140"
        },
        {
          "name": "MONGO_USERNAME",
          "value": "indyauctionmaster"
        },
        {
          "name": "SELLER_COGNITO_AUTH_ARN",
          "value": "arn:aws:cognito-idp:eu-west-2:539631565926:userpool/eu-west-2_Y6JeUSmsf"
        },
        {
          "name": "SELLER_DASHBOARD_APPLICATION_URL",
          "value": "https://qa-seller.indyauction.net/"
        },
        {
          "name": "SELLER_S3_BUCKET",
          "value": "indyauction-seller-web-application-qa"
        },
        {
          "name": "BUYER_COGNITO_AUTH_ARN",
          "value": "arn:aws:cognito-idp:eu-west-2:539631565926:userpool/eu-west-2_eRopiooUh"
        },
        {
          "name": "BUYER_COGNITO_CLIENT_ID",
          "value": "5dlrggccev3tps72ctf6mmhr0e"
        },
        {
          "name": "BUYER_COGNITO_IDENTITY_POOL_ID",
          "value": "eu-west-2:7e4be86f-c743-42cc-a045-51de06c5e9f0"
        },
        {
          "name": "CDN_URL",
          "value": "https://qa-cdn.indyauction.net/public/"
        },
        {
          "name": "LAMBDA_AUTH_LIB_NODE_ARN",
          "value": "arn:aws:lambda:eu-west-2:539631565926:layer:lambda_auth_layer:149"
        },
        {
          "name": "QUEUE_URL",
          "value": "https://sqs.eu-west-2.amazonaws.com/539631565926/auto-completion-email-qa.fifo"
        },
        {
          "name": "SELLER_DISTRIBUTION_ID",
          "value": "E2WSQWPW7WTX0R"
        },
        {
          "name": "SQS_QUEUE_ARN",
          "value": "arn:aws:sqs:eu-west-2:539631565926:auto-completion-email-qa.fifo"
        },
        {
          "name": "SUBNET_ID",
          "value": "subnet-0a75ec55354c6cf8f"
        },
        {
          "name": "ACCOUNT_ID",
          "value": "539631565926"
        },
        {
          "name": "ADMIN_APPLICATION_URL",
          "value": "qa-admin.indyauction.net"
        },
        {
          "name": "ADMIN_DISTRIBUTION_ID",
          "value": "E2M8SDP6L5MSLX"
        },
        {
          "name": "DOMAIN_CERTIFICATE",
          "value": "*.indyauction.net"
        },
        {
          "name": "DOMAIN_NAME",
          "value": "apis-qa.indyauction.net"
        },
        {
          "name": "DOMAIN_NAME_FRONT_END",
          "value": "https://apis-qa.indyauction.net"
        },
        {
          "name": "KMS_KEY_ID",
          "value": "3d601079-740e-4b89-ad90-e1582b76e080"
        },
        {
          "name": "SELLER_APPLICATION_URL",
          "value": "qa-seller.indyauction.net"
        },
        {
          "name": "SENDER_EMAIL",
          "value": "no-reply@indy.auction"
        },
        {
          "name": "ADMIN_COGNITO_CLIENT_ID",
          "value": "4i02152dv2i8f5spug63j51t8e"
        },
        {
          "name": "BUYER_COGNITO_IDENTITY_POOL_NAME",
          "value": "indyauction-buyers-qa"
        },
        {
          "name": "BUYER_COGNITO_USERPOOL_NAME",
          "value": "indyauction-buyers-qa"
        },
        {
          "name": "BUYER_STATIC_AUCTION_URL",
          "value": "https://www-qa-seller.indyauction.net/"
        },
        {
          "name": "DEFAULT_SUB_DOMAIN",
          "value": "www-qa"
        },
        {
          "name": "MONGO_PASSWORD",
          "value": "masterindyauction"
        },
        {
          "name": "SELLER_COGNITO_USERPOOL_ID",
          "value": "eu-west-2_Y6JeUSmsf"
        },
        {
          "name": "SELLER_COGNITO_USERPOOL_NAME",
          "value": "indyauction-qa"
        },
        {
          "name": "STATE_MACHINE_AUCTION_ARN",
          "value": "arn:aws:states:eu-west-2:539631565926:stateMachine:qa-auction-ended"
        },
        {
          "name": "AMPLIFY_DOMAIN_NAME",
          "value": "indyauction.net"
        },
        {
          "name": "BUCKET_NAME",
          "value": "indyauction-assets-qa"
        },
        {
          "name": "SECURITY_GROUP_ID",
          "value": "sg-00aa29e0b8201ecae"
        },
        {
          "name": "SELLER_COGNITO_CLIENT_ID",
          "value": "6j4jn8df33vi2eo2r0sg3amep1"
        },
        {
          "name": "SELLER_COGNITO_IDENTITY_POOL_ID",
          "value": "eu-west-2:a8cc53a4-8a4c-45a2-8705-86d72fce302d"
        },
        {
          "name": "SELLER_COGNITO_USERPOOL_DOMAIN",
          "value": "auth.qa-seller.indyauction.net"
        },
        {
          "name": "BASE_URL_SELLER",
          "value": "https://qa-seller.indyauction.net"
        },
        {
          "name": "GOOGLE_CLIENT_ID",
          "value": "688012880335-3fn25piue9bbpd38tc79kt31hqdg7erp.apps.googleusercontent.com"
        },
        {
          "name": "SECRET_ACCESS_KEY",
          "value": "VaR0nl/8WhchqX3X8UD5oGV4yBlqYMvaEb4X/8Ck"
        },
        {
          "name": "AMPLIFY_APP_ID",
          "value": "d3ho5bc94lkh8r"
        },
        {
          "name": "CUSTOMER_SESSION_TOKEN_SECRET",
          "value": "415886513FA789A3FF12B197944CB"
        },
        {
          "name": "FACEBOOK_CLIENT_SECRET",
          "value": "3b52f0375a772448659b7ec1482041ed"
        },
        {
          "name": "AMPLIFY_BRANCH",
          "value": "qa"
        },
        {
          "name": "BASE_URL_ADMIN",
          "value": "https://qa-admin.indyauction.net"
        },
        {
          "name": "BUYER_RECAPTCHA_KEY",
          "value": "6LdaS2wnAAAAABbjsJiJ3RSVj-FDFO7r1OOgcso0"
        },
        {
          "name": "GOOGLE_CLIENT_SECRET",
          "value": "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"
        },
        {
          "name": "SALES_CSV_FILE",
          "value": "/tmp/Sales_List.csv"
        },
        {
          "name": "ENCRYPTION_SECRET_KEY",
          "value": "Indy@auction@789"
        },
        {
          "name": "RECAPTCHA_URL",
          "value": "https://www.google.com/recaptcha/api/siteverify"
        },
        {
          "name": "SELLER_GOOGLE_PASSWORD",
          "value": "INDY@SELLER"
        },
        {
          "name": "STRIPE_API_KEY",
          "value": "sk_test_51NSrthFdWS7wL4EMgIaIlyzCIPY2387pcfibXJdCWsVJWg1dHrjAHZIoeKTrOCNcUNqkAmEuGNQti3q0mcE3hThb00CCZpfg5S"
        },
        {
          "name": "STRIPE_ENDPOINT_SECRET",
          "value": "whsec_c0FqOsCjXL7hoWGttRBF3pCdhGKq42jL"
        },
        {
          "name": "ACCESS_KEY_ID",
          "value": "AKIAX3JEMHRTLUBZVZZO"
        },
        {
          "name": "CREDIT_CARD_STRIPE_API_KEY",
          "value": "sk_test_51Nb00kSFIyzeA4NAfngqSbNEuIJh7fjMnkvL7nxtAgbxc3Vncw7ZJde6BlMTAGVxDwJNL6j2h0b9MlUCsSxNybpx00HZ4PqRNu"
        },
        {
          "name": "CSV_FILE",
          "value": "/tmp/Auctions.csv"
        },
        {
          "name": "SUMSUB_SECRET_KEY",
          "value": "6HZPanCLNtnjQoZreQvMTOVWUfQjz2Hj"
        },
        {
          "name": "BUYER_RECAPTCHA_URL",
          "value": "https://www.google.com/recaptcha/api/siteverify"
        },
        {
          "name": "PASSWORD_SECRET_KEY",
          "value": "SELLERINDYAUCTION"
        },
        {
          "name": "BASE_URL_BUYER",
          "value": "https://www-qa.indyauction.net"
        },
        {
          "name": "FACEBOOK_CLIENT_ID",
          "value": "690243929615152"
        },
        {
          "name": "KYB_LEVEL_NAME",
          "value": "basic-kyb-level"
        },
        {
          "name": "LEVEL_NAME",
          "value": "basic-kyc-level"
        },
        {
          "name": "SUMSUB_SECRET_KEY_WEBHOOK",
          "value": "QqR3gFjUsz7joN8yM9q507mCWZu"
        },
        {
          "name": "JWT_SECRET_KEY",
          "value": "SELLERINDYAUCTION"
        },
        {
          "name": "RECAPTCHA_KEY",
          "value": "6LdaS2wnAAAAABbjsJiJ3RSVj-FDFO7r1OOgcso0"
        },
        {
          "name": "SUMSUB_APP_TOKEN",
          "value": "sbx:Y2EdI2mqjgtSaJ4RiA0hEtTl.V83iiXleOlhQCg7EesN6O6vyEINEj56T"
        },
        {
          "name": "YOUR_HOSTED_ZONE_ID",
          "value": "Z025704116CQIAP0SY1NF"
        },
        {
          "name": "REDIS_ENDPOINT",
          "value": "websocket-redis.afgucd.ng.0001.euw2.cache.amazonaws.com"
        },
        {
          "name": "REGISTRED_BUYER",
          "value": "qa-register-auction"
        },
        {
          "name": "COGNITO_POOL_ID",
          "value": "eu-west-2_eRopiooUh"
        },
        {
          "name": "LOT_PUBLISHED_ARN",
          "value": "arn:aws:states:eu-west-2:539631565926:stateMachine:qa-lot-published"
        },
        {
          "name": "COGNITO_REGION",
          "value": "eu-west-2"
        },
        {
          "name": "MONGODB_CONNECTION_URL",
          "value": "mongodb://indyauctionmaster:masterindyauction@qa.cluster-cw1tmmuhdd7j.eu-west-2.docdb.amazonaws.com:27017/qa?authMechanism=DEFAULT&authSource=qa&retryWrites=false"
        },
        {
          "name": "SOCKET_URL",
          "value": "https://qa-websocket.indyauction.net"
        },
        {
          "name": "EC_INSTANCE_ID",
          "value": "i-0e19a27666ed14b16"
        },
        {
          "name": "DOMAIN_URL",
          "value": ".indyauction.net"
        },
        {
          "name": "LOT_UPDATE_QUEUE_URL",
          "value": "https://sqs.eu-west-2.amazonaws.com/539631565926/qa-bulk-lots-update"
        },
        {
          "name": "INSTANCE_CLASS",
          "value": "db.t4g.medium"
        },
        {
          "name": "REDIS_CLUSTER_CONNECTION_URL",
          "value": "redis://websocket-redis-cluster-enabled.afgucd.clustercfg.euw2.cache.amazonaws.com:6379"
        },
        {
          "name": "REDIS_CLUSTER_ENDPOINT",
          "value": "websocket-redis-cluster-enabled.afgucd.clustercfg.euw2.cache.amazonaws.com"
        },
        {
          "name": "CPU",
          "value": "4096"
        },
        {
          "name": "MEMORY",
          "value": "8192"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-create-group": "true",
          "awslogs-group": "/ecs/task",
          "awslogs-region": "eu-west-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}

#######################


resource "aws_ecs_task_definition" "websocket-task-definition" {
  family                   = "websocket-task-definition"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  task_role_arn            = resource.aws_iam_role.ecs_task_role.arn
  execution_role_arn       = resource.aws_iam_role.ecs_task_execution_role.arn
  cpu                      = "4086"
  memory                   = "8192"
  depends_on = [resource.aws_ecs_cluster.websocket-cluster,resource.aws_ecr_repository.repo1]
  container_definitions = jsonencode(local.datafile)
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
  name = var.DOMAIN # Replace with your domain name
  provider = aws.main
}

resource "aws_route53_record" "my_cname" {
  name    = "${var.STAGE}-websocket.${var.DOMAIN}" # Replace with your desired CNAME
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
    subnets         = [resource.aws_default_subnet.default_az1.id]  # Fetch default subnets dynamically
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

resource "aws_appautoscaling_target" "target" {
  max_capacity = 5
  min_capacity = 1
  resource_id =  "service/${aws_ecs_cluster.websocket-cluster.name}/${aws_ecs_service.ecs_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace = "ecs"
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
}
resource "aws_ssm_parameter" "api_gateway_certificate" {
  name  = "SOCKET_URL"
  type  = "String"
  value = "${var.STAGE}-websocket.${var.DOMAIN}"
  provider = aws.deployment-us
  overwrite = true
}


