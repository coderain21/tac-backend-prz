#AWS Provider with profile Stage account
provider "aws" {
  region ="eu-west-2"
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


# Create a subnet within the VPC
resource "aws_subnet" "mongodb_subnet" {
  vpc_id     = aws_default_vpc.def_vpc.id
  cidr_block = "172.31.96.0/20"
  provider = aws.deployment-eu
}

data "aws_availability_zones" "available" {
  provider = aws.deployment-eu
  }


resource "aws_eip" "nat_gateway" {
  vpc = true
  provider = aws.deployment-eu
}

resource "aws_default_subnet" "default_az1" {
  availability_zone = data.aws_availability_zones.available.names[0]
  provider = aws.deployment-eu
}

resource "aws_nat_gateway" "nat_gateway" {
  allocation_id = aws_eip.nat_gateway.id
  subnet_id = aws_default_subnet.default_az1.id
  tags = {
    "Name" = "NatGateway"
  }
  provider = aws.deployment-eu
}

output "nat_gateway_ip" {
  value = aws_eip.nat_gateway.public_ip
}

resource "aws_route_table" "instance" {
  vpc_id = aws_default_vpc.def_vpc.id
  route {
    cidr_block = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat_gateway.id
  }
  lifecycle {
    ignore_changes = [route]
  }
  provider = aws.deployment-eu
}

resource "aws_route_table_association" "instance" {
  subnet_id = aws_subnet.mongodb_subnet.id
  route_table_id = aws_route_table.instance.id
  provider = aws.deployment-eu
}


resource "aws_security_group" "ssh_sg_1" {
  name        = "ssh-security-group1"
  description = "SSH Security Group"
  vpc_id = aws_default_vpc.def_vpc.id
  # Allow SSH traffic
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow SSH from anywhere (use with caution)"
  }

  # Allow all inbound traffic
  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all inbound traffic (NOT recommended for prod)"
  }

  # Allow all outbound traffic
  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
    description      = "Allow all outbound traffic"
  }
  lifecycle {
    ignore_changes = [egress]
  }
  provider = aws.deployment-eu
}

resource "aws_iam_role" "ssm_role" {
  name = "ssm-role-ec2"
  provider = aws.deployment-eu

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "ec2.amazonaws.com",
        },
      },
    ],
  })
}



resource "aws_ssm_parameter" "subnet_id" {
  name  = "SUBNET_ID"
  type  = "String"
  value = aws_subnet.mongodb_subnet.id
  provider = aws.deployment-eu
  overwrite = true
}

resource "aws_ssm_parameter" "security_group_id" {
  name  = "SECURITY_GROUP_ID"
  type  = "String"
  value = aws_security_group.ssh_sg_1.id
  provider = aws.deployment-eu
  overwrite = true
}

resource "aws_default_vpc" "def_vpc"{
  provider = aws.deployment-eu
}
