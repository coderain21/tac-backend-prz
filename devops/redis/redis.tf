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
# Create a subnet within the VPC
resource "aws_subnet" "mongodb_subnet" {
  vpc_id     = aws_default_vpc.def_vpc.id
  cidr_block = "172.31.96.0/20"
  provider = aws.deployment-us
}

# Create security group 
resource "aws_security_group" "ssh_sg" {
  name        = "ssh-security-group"
  description = "SSH Security Group"
  vpc_id = aws_default_vpc.def_vpc.id
  # Allow SSH traffic
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Be cautious with this rule in a production environment
  }
  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"] # Be cautious with this rule in a production environment
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

resource "aws_elasticache_cluster" "redis" {
  cluster_id              = "redis-cluster"
  engine                  = "redis"
  node_type               = "cache.t4g.micro"
  num_cache_nodes         = 2
  port                    = 6379
  subnet_group_name       = "redis-cluster-subnet-group"
  security_group_ids      = ["sg-123456"]
  maintenance_window      = "sun:05:00-sun:09:00"
  snapshot_retention_limit = 0
  snapshot_window         = "05:00-09:00"
  tags = {
    Name = "redis-cluster"
  }
}