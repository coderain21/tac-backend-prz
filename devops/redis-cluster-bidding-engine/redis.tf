#AWS Provider with profile Stage account
provider "aws" {
  region ="eu-west-2"
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}

terraform {
  backend "s3" {
    region       = "eu-west-2"  # Replace with the appropriate AWS region
    encrypt      = true
    use_lockfile = true  # Enable the S3 locking feature
  }
}

data "aws_vpc" "default" {
  default = true
  provider = aws.deployment-us
}


resource "aws_elasticache_subnet_group" "subnet_groups" {
  name       = "redis-subnet-group-cluster-enabled"
  subnet_ids = [data.aws_ssm_parameter.subnet.value]
  provider = aws.deployment-us
}


data "aws_ssm_parameter" "redis_node_type" {
  name = "REDIS_NODE_TYPE"
}
data "aws_ssm_parameter" "redis_node_groups" {
  name = "REDIS_NODE_GROUPS"
}
data "aws_ssm_parameter" "redis_node_replica_groups" {
  name = "REDIS_NODE_REPLICA_GROUPS"
}
data "aws_ssm_parameter" "security_group" {
  name = "SECURITY_GROUP_ID"
}
data "aws_ssm_parameter" "subnet" {
  name = "SUBNET_ID"
}



resource "aws_elasticache_replication_group" "websocket" {
  automatic_failover_enabled  = true
  subnet_group_name           = aws_elasticache_subnet_group.subnet_groups.name
  replication_group_id        = "websocket-redis-cluster-enabled"
  description                 = "websocket description with cluster enabled"
  node_type                   = data.aws_ssm_parameter.redis_node_type.value
  num_node_groups         = data.aws_ssm_parameter.redis_node_groups.value
  replicas_per_node_group = data.aws_ssm_parameter.redis_node_replica_groups.value
  parameter_group_name        = "default.redis7.cluster.on"
  port                        = 6379
  security_group_ids = [data.aws_ssm_parameter.security_group.value]
  maintenance_window         = "sun:01:00-sun:03:00"
  apply_immediately          = true
  provider                  = aws.deployment-us
}
resource "aws_ssm_parameter" "distribution_id" {
  name  = "REDIS_CLUSTER_ENDPOINT"
  type  = "String"
  value = aws_elasticache_replication_group.websocket.configuration_endpoint_address
  provider = aws.deployment-us
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
  provider = aws.deployment-us
}