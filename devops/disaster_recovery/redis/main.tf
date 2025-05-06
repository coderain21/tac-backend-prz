# AWS Provider with profile Stage account
provider "aws" {
  region  = "eu-west-2"
  alias   = "deployment-eu"
  profile = "indyauction-${var.STAGE}"
}

terraform {
  backend "s3" {
    region       = "eu-west-2"
    encrypt      = true
    use_lockfile = true
  }
}

locals {
  is_deployment_stage = contains(["qa", "prod"], var.STAGE)
}

data "aws_vpc" "default" {
  count    = local.is_deployment_stage ? 1 : 0
  default  = true
  provider = aws.deployment-eu
}

resource "aws_default_subnet" "default_az1" {
  count               = local.is_deployment_stage ? 1 : 0
  availability_zone   = "eu-west-2c"
  provider            = aws.deployment-eu
}

resource "aws_elasticache_subnet_group" "subnet_groups" {
  count      = local.is_deployment_stage ? 1 : 0
  name       = "redis-subnet-group-cluster-enabled"
  subnet_ids = [aws_default_subnet.default_az1[0].id]
  provider   = aws.deployment-eu
}

resource "aws_security_group" "security_groups" {
  count       = local.is_deployment_stage ? 1 : 0
  name        = "redis-security-group-cluster-enabled"
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
  count    = local.is_deployment_stage ? 1 : 0
  name     = "REDIS_NODE_TYPE"
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "redis_node_groups" {
  count    = local.is_deployment_stage ? 1 : 0
  name     = "REDIS_NODE_GROUPS"
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "redis_node_replica_groups" {
  count    = local.is_deployment_stage ? 1 : 0
  name     = "REDIS_NODE_REPLICA_GROUPS"
  provider = aws.deployment-eu
}

resource "aws_elasticache_parameter_group" "custom_redis" {
  count   = local.is_deployment_stage ? 1 : 0
  name    = "custom-redis7-cluster"
  family  = "redis7"
  provider = aws.deployment-eu

  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }

  parameter {
    name  = "cluster-enabled"
    value = "yes"
  }
}

resource "aws_elasticache_replication_group" "websocket" {
  count = local.is_deployment_stage ? 1 : 0

  automatic_failover_enabled  = true
  subnet_group_name           = aws_elasticache_subnet_group.subnet_groups[0].name
  replication_group_id        = "websocket-redis-cluster-enabled"
  description                 = "websocket description with cluster enabled"
  node_type                   = data.aws_ssm_parameter.redis_node_type[0].value
  num_node_groups             = data.aws_ssm_parameter.redis_node_groups[0].value
  replicas_per_node_group     = data.aws_ssm_parameter.redis_node_replica_groups[0].value
  parameter_group_name        = aws_elasticache_parameter_group.custom_redis[0].name
  port                        = 6379
  security_group_ids          = [aws_security_group.security_groups[0].id]
  snapshot_window             = "04:00-05:00"
  maintenance_window          = "sun:01:00-sun:03:00"
  apply_immediately           = true
  provider                    = aws.deployment-eu
}

resource "aws_ssm_parameter" "distribution_id" {
  count   = local.is_deployment_stage ? 1 : 0
  name    = "REDIS_CLUSTER_ENDPOINT"
  type    = "String"
  value   = aws_elasticache_replication_group.websocket[0].configuration_endpoint_address
  overwrite = true 
  provider  = aws.deployment-eu
}

locals {
  redis_host = local.is_deployment_stage ? split(":", aws_elasticache_replication_group.websocket[0].configuration_endpoint_address)[0] : ""
}

resource "aws_ssm_parameter" "redis_host_parameter" {
  count   = local.is_deployment_stage ? 1 : 0
  name    = "REDIS_CLUSTER_CONNECTION_URL"
  type    = "String"
  value   = "redis://${local.redis_host}:6379"
  overwrite = true
  provider  = aws.deployment-eu
}


################################################### FOR PRE-PRODUCTION AND DEV  #######################################################

data "aws_ssm_parameter" "subnet_id" {
  count   = local.is_deployment_stage ? 0 : 1
  name = "PUBLIC_SUBNET_ID"
  provider = aws.deployment-eu
}
data "aws_ssm_parameter" "vpc_id" {
  count   = local.is_deployment_stage ? 0 : 1
  name     = "VPC_ID"
  provider = aws.deployment-eu
}
resource "aws_elasticache_subnet_group" "subnet_groups" {
  count   = local.is_deployment_stage ? 0 : 1
  name       = "new-redis-subnet-group-cluster-enabled"
  subnet_ids = [data.aws_ssm_parameter.subnet_id.value]
  provider = aws.deployment-eu
}

resource "aws_security_group" "security_groups" {
  count   = local.is_deployment_stage ? 0 : 1
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
  count   = local.is_deployment_stage ? 0 : 1
  name = "REDIS_NODE_TYPE"
  provider                  = aws.deployment-eu
}
data "aws_ssm_parameter" "redis_node_groups" {
  count   = local.is_deployment_stage ? 0 : 1
  name = "REDIS_NODE_GROUPS"
  provider                  = aws.deployment-eu
}
data "aws_ssm_parameter" "redis_node_replica_groups" {
  count   = local.is_deployment_stage ? 0 : 1
  name = "REDIS_NODE_REPLICA_GROUPS"
  provider                  = aws.deployment-eu
}

resource "aws_elasticache_parameter_group" "custom_redis" {
  count   = local.is_deployment_stage ? 0 : 1
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
  count   = local.is_deployment_stage ? 0 : 1
  automatic_failover_enabled  = true
  subnet_group_name           = aws_elasticache_subnet_group.subnet_groups.name
  replication_group_id        = "new-websocket-redis-cluster-enabled"
  description                 = "websocket description with cluster enabled"
  node_type                   = data.aws_ssm_parameter.redis_node_type.value
  num_node_groups         = data.aws_ssm_parameter.redis_node_groups.value
  replicas_per_node_group = data.aws_ssm_parameter.redis_node_replica_groups.value
  parameter_group_name        = aws_elasticache_parameter_group.custom_redis.name
  port                        = 6379
  security_group_ids = [resource.aws_security_group.security_groups.id]
  snapshot_name               = "pre-production-snapsot"
  apply_immediately          = true
  snapshot_window            = "04:00-05:00"
  maintenance_window         = "sun:01:00-sun:03:00"
  provider                  = aws.deployment-eu
}
resource "aws_ssm_parameter" "distribution_id" {
  count   = local.is_deployment_stage ? 0 : 1
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
  count   = local.is_deployment_stage ? 0 : 1
  name  = "REDIS_CLUSTER_CONNECTION_URL"
  type  = "String"
  value = "redis://${local.redis_host}:6379"
  overwrite = true 
  provider = aws.deployment-eu
}