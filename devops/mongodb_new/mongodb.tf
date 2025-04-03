 

  
#AWS Provider with profile main account
provider "aws" {
  region = var.REGION
  alias = "main"   # Specify a default AWS region here
  profile = "indyauction-main"
}

resource "random_password" "password" {
  length           = 16
  special          = false
}


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

data "aws_ssm_parameter" "cidr_blocks" {
  name     = "PUBLIC_SUBNET_CIDR_BLOCK_3"
  provider = aws.deployment-eu
}

data "aws_ssm_parameter" "snapshot_arn" {
  name     = "SNAPSHOT_ARN"
  provider = aws.deployment-eu
}

resource "aws_subnet" "mongodb_subnet" {
  vpc_id            = data.aws_ssm_parameter.vpc_id.value
  cidr_block        = data.aws_ssm_parameter.cidr_blocks.value
  availability_zone = "eu-west-2c"
  provider          = aws.deployment-eu
}

# Fetch all subnets in the VPC
data "aws_subnets" "all_subnets" {
  filter {
    name   = "vpc-id"
    values = [data.aws_ssm_parameter.vpc_id.value]
  }

  provider = aws.deployment-eu
}

data "aws_subnets" "filtered_subnets" {
  provider = aws.deployment-eu
  filter {
    name   = "vpc-id"
    values = [data.aws_ssm_parameter.vpc_id.value]
  }
  filter {
    name   = "map-public-ip-on-launch"
    values = ["true"]
  }
}

resource "aws_docdb_subnet_group" "subnet_group" {
  name       = "mongodb-subnet-group"
  subnet_ids = data.aws_subnets.filtered_subnets.ids
  provider   = aws.deployment-eu
}

data "aws_ssm_parameter" "mongo_password" {
  name = "MONGO_PASSWORD"
  provider = aws.deployment-eu
}


#######################

resource "aws_key_pair" "my_key"{
    key_name = "tf-key-pair-new-${var.STAGE}"
    public_key = tls_private_key.rsa.public_key_openssh
    provider = aws.deployment-eu
}
resource "tls_private_key" "rsa"{
    algorithm = "RSA"
    rsa_bits  = 4096
}
resource "local_file" "tf-key"{
    content  = tls_private_key.rsa.private_key_pem
    filename = "tf-key-pair-new-${var.STAGE}.pem"
}

########################


resource "aws_docdb_cluster_parameter_group" "my_parameter_group" {
  name        = "${var.STAGE}-new-parameter-group"
  family      = "docdb5.0" # Adjust the family to match your DocumentDB version
  description = "My DocumentDB Parameter Group"
  parameter {
    name  = "tls"
    value = "disabled"
  }
  provider = aws.deployment-eu
}


resource "aws_eip" "nat_gateway" {
  vpc = true
  provider = aws.deployment-eu
}

resource "aws_nat_gateway" "nat_gateway" {
  allocation_id = aws_eip.nat_gateway.id
  subnet_id     = data.aws_ssm_parameter.subnet_id.value
  tags = {
    "Name" = "NatGateway_new"
  }
  provider = aws.deployment-eu
}

output "nat_gateway_ip" {
  value = aws_eip.nat_gateway.public_ip
}

resource "aws_route_table" "instance" {
  vpc_id = data.aws_ssm_parameter.vpc_id.value
  route {
    cidr_block = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat_gateway.id
  }
  provider = aws.deployment-eu
}


resource "aws_route_table_association" "instance" {
  subnet_id = aws_subnet.mongodb_subnet.id
  route_table_id = aws_route_table.instance.id
  provider = aws.deployment-eu
}

data "aws_availability_zones" "available" {
  provider = aws.deployment-eu
  }


data "aws_ssm_parameter" "instance_class" {
  name = "INSTANCE_CLASS"
  provider = aws.deployment-eu
}
resource "aws_docdb_cluster_instance" "cluster_instances" {
  identifier         = "new-docdb-mongodb-instance"
  cluster_identifier = aws_docdb_cluster.my_documentdb_cluster.id
  instance_class     = data.aws_ssm_parameter.instance_class.value
  apply_immediately = true
  provider = aws.deployment-eu
}



# Create the DocumentDB instance
resource "aws_docdb_cluster" "my_documentdb_cluster" {
  cluster_identifier        = "new-${var.STAGE}"
  engine                    = "docdb"
  engine_version            = "5.0.0" # Adjust the version as needed
  db_cluster_parameter_group_name      = aws_docdb_cluster_parameter_group.my_parameter_group.name
  db_subnet_group_name = aws_docdb_subnet_group.subnet_group.name
  snapshot_identifier = data.aws_ssm_parameter.snapshot_arn.value
  skip_final_snapshot        = true
  master_username         = "indyauctionAdmin"
  master_password         = data.aws_ssm_parameter.mongo_password.value
  vpc_security_group_ids = [aws_security_group.ssh_sg_new.id]
  provider = aws.deployment-eu
}






resource "aws_security_group" "ssh_sg_new" {
  name        = "new-ssh-security-groups"
  description = "SSH Security Group"
  vpc_id = data.aws_ssm_parameter.vpc_id.value
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
  lifecycle {
    ignore_changes = [ingress]
  }
  # ingress {
  #   from_port       = 27017
  #   to_port         = 27017
  #   protocol        = "tcp"
  #   security_groups = [data.aws_ssm_parameter.security_group_b.value] # Replace with the security group ID of the Lambda function in Account B
  # }
  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
  provider = aws.deployment-eu
}



resource "aws_iam_role" "ssm_role" {
  name = "new-ssm-role-ec2"
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

resource "aws_iam_role_policy_attachment" "ssm_core_policy_attachment" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  role       = aws_iam_role.ssm_role.name
  provider = aws.deployment-eu
}

resource "aws_iam_role_policy_attachment" "ssm_full_policy_attachment" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMFullAccess"
  role       = aws_iam_role.ssm_role.name
  provider = aws.deployment-eu
}
resource "aws_iam_role_policy_attachment" "s3_cognito_full_policy_attachment" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonCognitoPowerUser"
  role       = aws_iam_role.ssm_role.name
  provider = aws.deployment-eu
}
resource "aws_iam_role_policy_attachment" "s3_full_policy_attachment" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
  role       = aws_iam_role.ssm_role.name
  provider = aws.deployment-eu
}

# Create an EC2 instance
resource "aws_instance" "ssh_tunnel" {
  ami           = "ami-0e5f882be1900e43b" # Specify a valid Amazon Linux AMI ID
  instance_type = "t2.micro"          # Choose an appropriate instance type
  key_name = aws_key_pair.my_key.key_name
  vpc_security_group_ids = [aws_security_group.ssh_sg_new.id]
  provider = aws.deployment-eu
  subnet_id = data.aws_ssm_parameter.subnet_id.value
  associate_public_ip_address = true
  # User data to create the SSH tunnel
  user_data = <<-EOF
              #!/bin/bash
              wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-archive-keyring.gpg
              echo "deb [signed-by=/usr/share/keyrings/mongodb-archive-keyring.gpg] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/5.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list
              sudo apt-get update -y
              sudo apt-get install -y mongodb-mongosh zip
              wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-x86_64-100.9.4.deb
              sudo dpkg -i mongodb-database-tools-ubuntu2204-x86_64-100.9.4.deb
              apt-get update && apt-get install -y
              curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
              unzip -u awscliv2.zip
              ./aws/install
              EOF
  iam_instance_profile = aws_iam_instance_profile.ssm_profile.name
}
resource "aws_iam_instance_profile" "ssm_profile" {
  name = "new-ssm-role-ec2"
  provider = aws.deployment-eu
  role = aws_iam_role.ssm_role.name
}
resource "aws_eip" "example" {
  instance = aws_instance.ssh_tunnel.id # Replace with your EC2 instance ID
  provider = aws.deployment-eu
}

resource "aws_ssm_parameter" "documentdb" {
  name  = "MONGODB_CONNECTION_STRING"
  type  = "String"
  value = "mongodb://indyauctionAdmin:${data.aws_ssm_parameter.mongo_password.value}@${aws_docdb_cluster.my_documentdb_cluster.endpoint}:27017/${var.STAGE}?authMechanism=SCRAM-SHA-1&authSource=${var.STAGE}&retryWrites=false"
  provider = aws.deployment-eu
  overwrite = true
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
  value = aws_security_group.ssh_sg_new.id
  provider = aws.deployment-eu
  overwrite = true
}

resource "aws_ssm_parameter" "ec2_instance_id" {
  name  = "EC2_INSTANCE_ID"
  type  = "String"
  value = resource.aws_instance.ssh_tunnel.id
  provider = aws.deployment-eu
  overwrite = true
}



resource "aws_ssm_parameter" "mongodb_password" {
  name  = "MONGO_PASSWORD"
  type  = "String"
  value = data.aws_ssm_parameter.mongo_password.value
  provider = aws.deployment-eu
  overwrite = true
}