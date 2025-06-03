
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


data "aws_ssm_parameter" "cidr_block" {
  name = "CIDR_BLOCK"
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "public_subnet_cidr" {
  name = "PUBLIC_SUBNET_CIDR_BLOCK_1"
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "public_subnet_cidr_2" {
  name = "PUBLIC_SUBNET_ID_CIDR_BLOCK_2"
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "private_subnet_cidr" {
  name = "PRIVATE_SUBNET_ID_CIDR_BLOCK"
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "private_subnet_cidr_2" {
  name = "PRIVATE_SUBNET_ID_CIDR_BLOCK_2"
  provider = aws.deployment-eu
}

resource "aws_vpc" "main" {
  cidr_block = data.aws_ssm_parameter.cidr_block.value
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "new-vpc"
  }
  provider = aws.deployment-eu
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "new-igw"
  }
  provider = aws.deployment-eu
  depends_on = [resource.aws_vpc.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "public-route-table"
  }
  provider = aws.deployment-eu
  depends_on = [resource.aws_vpc.main]
}

resource "aws_subnet" "public_subnet_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = data.aws_ssm_parameter.public_subnet_cidr.value
  availability_zone = "eu-west-2a"
  map_public_ip_on_launch = true

  tags = {
    Name = "public-subnet-a"
  }
  provider = aws.deployment-eu
  depends_on = [resource.aws_vpc.main]
}

resource "aws_subnet" "public_subnet_c" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = data.aws_ssm_parameter.public_subnet_cidr_2.value
  availability_zone = "eu-west-2c"
  map_public_ip_on_launch = true

  tags = {
    Name = "public-subnet-c"
  }
  provider = aws.deployment-eu
  depends_on = [resource.aws_vpc.main]
}

resource "aws_subnet" "private_subnet_b1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = data.aws_ssm_parameter.private_subnet_cidr.value
  availability_zone = "eu-west-2b"

  tags = {
    Name = "private-subnet-b1"
  }
  provider = aws.deployment-eu
  depends_on = [resource.aws_vpc.main]
}

resource "aws_subnet" "private_subnet_b2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = data.aws_ssm_parameter.private_subnet_cidr_2.value
  availability_zone = "eu-west-2b"

  tags = {
    Name = "private-subnet-b2"
  }
  provider = aws.deployment-eu
  depends_on = [resource.aws_vpc.main]
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_subnet_a.id
  route_table_id = aws_route_table.public.id
  provider = aws.deployment-eu
  depends_on = [resource.aws_vpc.main]
}


resource "aws_route_table_association" "public_c" {
  subnet_id      = aws_subnet.public_subnet_c.id
  route_table_id = aws_route_table.public.id
  provider = aws.deployment-eu
  depends_on = [resource.aws_vpc.main]
}

output "vpc_id" {
  value = aws_vpc.main.id
}

resource "aws_ssm_parameter" "private_subnet_id" {
  name  = "PRIVATE_SUBNET_ID"
  type  = "String"
  value = resource.aws_subnet.private_subnet_b1.id
  provider = aws.deployment-eu
  overwrite = true
}

resource "aws_ssm_parameter" "public_subnet_id" {
  name  = "PUBLIC_SUBNET_ID"
  type  = "String"
  value = resource.aws_subnet.public_subnet_a.id
  provider = aws.deployment-eu
  overwrite = true
}
resource "aws_ssm_parameter" "vpc_id" {
  name  = "VPC_ID"
  type  = "String"
  value = resource.aws_vpc.main.id
  provider = aws.deployment-eu
  overwrite = true
}