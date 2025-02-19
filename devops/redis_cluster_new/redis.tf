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

data "aws_ssm_parameter" "subnet_id" {
  name = "PUBLIC_SUBNET_ID"
  provider = aws.deployment-eu
}
data "aws_ssm_parameter" "vpc_id" {
  name     = "VPC_ID"
  provider = aws.deployment-eu
}
resource "aws_elasticache_subnet_group" "subnet_groups" {
  name       = "new-redis-subnet-group-cluster-enabled"
  subnet_ids = [data.aws_ssm_parameter.subnet_id.value]
  provider = aws.deployment-eu
}

resource "aws_security_group" "security_groups" {
  name        = "new-redis-security-group-cluster-enabled"
  vpc_id = data.aws_ssm_parameter.vpc_id.value
  description = "Allow inbound traffic on ports 22, 80, 443, and 6379"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
   egress {
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
  provider                  = aws.deployment-eu
}
data "aws_ssm_parameter" "redis_node_groups" {
  name = "REDIS_NODE_GROUPS"
  provider                  = aws.deployment-eu
}
data "aws_ssm_parameter" "redis_node_replica_groups" {
  name = "REDIS_NODE_REPLICA_GROUPS"
  provider                  = aws.deployment-eu
}

resource "aws_elasticache_replication_group" "websocket" {
  automatic_failover_enabled  = true
  subnet_group_name           = aws_elasticache_subnet_group.subnet_groups.name
  replication_group_id        = "new-websocket-redis-cluster-enabled"
  description                 = "websocket description with cluster enabled"
  node_type                   = data.aws_ssm_parameter.redis_node_type.value
  num_node_groups         = data.aws_ssm_parameter.redis_node_groups.value
  replicas_per_node_group = data.aws_ssm_parameter.redis_node_replica_groups.value
  parameter_group_name        = "default.redis7.cluster.on"
  port                        = 6379
  security_group_ids = [resource.aws_security_group.security_groups.id]
  snapshot_name               = "pre-production-snapsot"
  apply_immediately          = true
  provider                  = aws.deployment-eu
}
resource "aws_ssm_parameter" "distribution_id" {
  name  = "REDIS_CLUSTER_ENDPOINT"
  type  = "String"
  value = aws_elasticache_replication_group.websocket.configuration_endpoint_address
  provider = aws.deployment-eu
  overwrite = true 
}
locals {
  redis_host     = split(":", aws_elasticache_replication_group.websocket.configuration_endpoint_address)[0]
}
resource "aws_ssm_parameter" "redis_host_parameter" {
  name  = "REDIS_CLUSTER_CONNECTION_URL"
  type  = "String"
  value = "redis://${local.redis_host}:6379"
  overwrite = true 
  provider = aws.deployment-eu
}