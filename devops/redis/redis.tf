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
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${data.external.env.result["STAGE"]}"
}
data "aws_vpc" "default" {
  default = true
  provider = aws.deployment-us
}
data "aws_subnets" "default" {
  filter {
    
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  provider = aws.deployment-us
}

resource "aws_elasticache_subnet_group" "subnet_groups" {
  name       = "redis-subnet-group"
  subnet_ids = data.aws_subnets.default.ids
  provider = aws.deployment-us
}

resource "aws_security_group" "security_groups" {
  name        = "redis-security-group"
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
  provider = aws.deployment-us
}


resource "aws_elasticache_replication_group" "websocket" {
  automatic_failover_enabled  = true
  preferred_cache_cluster_azs = ["eu-west-2a", "eu-west-2b"]
  subnet_group_name           = aws_elasticache_subnet_group.subnet_groups.name
  replication_group_id        = "websocket-redis"
  description                 = "websocket description"
  node_type                   = "cache.t4g.micro"
  num_cache_clusters          = 2
  parameter_group_name        = "default.redis7"
  port                        = 6379
  security_group_ids = [resource.aws_security_group.security_groups.id]
  provider                  = aws.deployment-us

  lifecycle {
    ignore_changes = [num_cache_clusters]
  }
}
resource "aws_ssm_parameter" "distribution_id" {
  name  = "REDIS_ENDPOINT"
  type  = "String"
  value = aws_elasticache_replication_group.websocket.primary_endpoint_address
  provider = aws.deployment-us
  overwrite = true 
}
locals {
  redis_host     = split(":", aws_elasticache_replication_group.websocket.primary_endpoint_address)[0]
}

