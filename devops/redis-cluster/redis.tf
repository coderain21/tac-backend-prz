#AWS Provider with profile Stage account
provider "aws" {
  region = var.REGION
  alias = "deployment-eu"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

terraform {
  backend "s3" {
    region       = "eu-west-2"  # Replace with the appropriate AWS region
    encrypt      = true
    use_lockfile = true  # Enable the S3 locking feature
  }
}

# Conditional data sources based on stage
data "aws_vpc" "default" {
  count = contains(["qa", "prod"], var.STAGE) ? 1 : 0
  default = true
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "vpc_id" {
  count = contains(["dev", "pre-production"], var.STAGE) ? 1 : 0
  name = "VPC_ID"
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "subnet_id" {
  count = contains(["dev", "pre-production"], var.STAGE) ? 1 : 0
  name = "PUBLIC_SUBNET_ID"
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "mongodb_security_group_id" {
  count = contains(["dev", "pre-production"], var.STAGE) ? 1 : 0
  name = "SECURITY_GROUP_ID"
  provider = aws.deployment-eu
}

resource "aws_default_subnet" "default_az1" {
  count = contains(["qa", "prod"], var.STAGE) ? 1 : 0
  availability_zone = "eu-west-2c"
  provider = aws.deployment-eu
}
# Get MongoDB subnet for dev to place Redis in same VPC
data "aws_ssm_parameter" "mongodb_subnet_id" {
  count = contains(["dev", "pre-production"], var.STAGE) ? 1 : 0
  name = "SUBNET_ID"
  provider = aws.deployment-eu
}

# Get all subnets in the new VPC for dev
data "aws_subnets" "vpc_subnets" {
  count = contains(["dev", "pre-production"], var.STAGE) ? 1 : 0
  provider = aws.deployment-eu
  filter {
    name   = "vpc-id"
    values = [data.aws_ssm_parameter.vpc_id[0].value]
  }
}

resource "aws_elasticache_subnet_group" "subnet_groups" {
  name = contains(["dev", "pre-production"], var.STAGE) ? "new-redis-subnet-group-cluster-enabled" : "redis-subnet-group-cluster-enabled"
  subnet_ids = contains(["qa", "prod"], var.STAGE) ? [resource.aws_default_subnet.default_az1[0].id] : data.aws_subnets.vpc_subnets[0].ids
  provider = aws.deployment-eu
}

resource "aws_security_group" "security_groups" {
  name        = contains(["dev", "pre-production"], var.STAGE) ? "new-redis-security-group-cluster-enabled" : "redis-security-group-cluster-enabled"
  vpc_id      = contains(["qa", "prod"], var.STAGE) ? data.aws_vpc.default[0].id : data.aws_ssm_parameter.vpc_id[0].value
  description = "Allow inbound traffic on ports 22, 80, 443, and 6379"

  ingress {
    description = "Allow SSH access"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow HTTP access"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow HTTPS access"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow Redis access"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  # Allow MongoDB EC2 subnet to access Redis
  dynamic "ingress" {
    for_each = contains(["dev", "pre-production"], var.STAGE) ? [1] : []
    content {
      description = "Allow MongoDB EC2 access to Redis"
      from_port   = 6379
      to_port     = 6379
      protocol    = "tcp"
      security_groups = [data.aws_ssm_parameter.mongodb_security_group_id[0].value]
    }
  }
  egress {
    description      = "Allow all outbound traffic"
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "redis_node_type" {
  name = "REDIS_NODE_TYPE"
  provider = aws.deployment-eu
}
data "aws_ssm_parameter" "redis_node_groups" {
  name = "REDIS_NODE_GROUPS"
  provider = aws.deployment-eu
}
data "aws_ssm_parameter" "redis_node_replica_groups" {
  name = "REDIS_NODE_REPLICA_GROUPS"
  provider = aws.deployment-eu
}
resource "aws_elasticache_parameter_group" "custom_redis" {
  name   = "custom-redis7-cluster"
  family = "redis7"
  provider = aws.deployment-eu

  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
  parameter {
    name  = "cluster-enabled"
    value = "yes"  # Must match the existing cluster setting
  }
}

resource "aws_elasticache_replication_group" "websocket" {
  automatic_failover_enabled  = true
  subnet_group_name           = aws_elasticache_subnet_group.subnet_groups.name
  replication_group_id        = contains(["dev", "pre-production"], var.STAGE) ? "new-websocket-redis-cluster-enabled" : "websocket-redis-cluster-enabled"
  description                 = "websocket description with cluster enabled"
  node_type                   = data.aws_ssm_parameter.redis_node_type.value
  num_node_groups         = data.aws_ssm_parameter.redis_node_groups.value
  replicas_per_node_group = data.aws_ssm_parameter.redis_node_replica_groups.value
  parameter_group_name        = var.STAGE == "bidding-engine" ? "default.redis7.cluster.on" : aws_elasticache_parameter_group.custom_redis.name
  port                        = 6379
  security_group_ids = [resource.aws_security_group.security_groups.id]
  snapshot_window            = "04:00-05:00"
  maintenance_window         = "sun:01:00-sun:03:00"
  apply_immediately          = true
  provider                  = aws.deployment-eu
}
locals {
  # Use configuration endpoint for cluster mode
  redis_endpoint = aws_elasticache_replication_group.websocket.configuration_endpoint_address
  redis_host     = split(":", local.redis_endpoint)[0]
}

resource "aws_ssm_parameter" "distribution_id" {
  name  = "REDIS_CLUSTER_ENDPOINT"
  type  = "String"
  value = local.redis_endpoint
  provider = aws.deployment-eu
  overwrite = true 
}

resource "aws_ssm_parameter" "redis_host_parameter" {
  name  = "REDIS_CLUSTER_CONNECTION_URL"
  type  = "String"
  value = "redis://${local.redis_host}:6379"
  overwrite = true 
  provider = aws.deployment-eu
}

