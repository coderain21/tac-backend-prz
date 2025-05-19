
#AWS Provider with profile Stage account
provider "aws" {
  region = var.REGION
  alias = "deployment-eu"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}
resource "random_password" "password" {
  length           = 16
  special          = false
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

#######################

resource "aws_key_pair" "my_key"{
    key_name = "tf-key-pair"
    public_key = tls_private_key.rsa.public_key_openssh
    provider = aws.deployment-eu
}
resource "tls_private_key" "rsa"{
    algorithm = "RSA"
    rsa_bits  = 4096
}
resource "local_file" "tf-key"{
    content  = tls_private_key.rsa.private_key_pem
    filename = "tf-key-pair-${var.STAGE}.pem"
}

########################


resource "aws_docdb_cluster_parameter_group" "my_parameter_group" {
  name        = "${var.STAGE}-parameter-group"
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

data "aws_availability_zones" "available" {
  provider = aws.deployment-eu
  }

resource "aws_default_subnet" "default_az1" {
  availability_zone = data.aws_availability_zones.available.names[0]
  provider = aws.deployment-eu
}
data "aws_ssm_parameter" "instance_class" {
  name = "INSTANCE_CLASS"
  provider = aws.deployment-eu
}
data "aws_ssm_parameter" "snapshot_name" {
  name = "DB_SNAPSHOT_NAME"
  provider = aws.deployment-eu
}
resource "aws_docdb_cluster_instance" "cluster_instances" {
  identifier         = "docdb-mongodb-instance"
  cluster_identifier = aws_docdb_cluster.my_documentdb_cluster.id
  instance_class     = data.aws_ssm_parameter.instance_class.value
  preferred_maintenance_window = "sun:01:00-sun:03:00"
  apply_immediately = true
  provider = aws.deployment-eu
}



# Create the DocumentDB instance
resource "aws_docdb_cluster" "my_documentdb_cluster" {
  cluster_identifier        = "${var.STAGE}"
  engine                    = "docdb"
  engine_version            = "5.0.0" # Adjust the version as needed
  db_cluster_parameter_group_name      = aws_docdb_cluster_parameter_group.my_parameter_group.name
  skip_final_snapshot        = true
  master_username         = "indyauctionAdmin"
  master_password         = random_password.password.result
  vpc_security_group_ids = [aws_security_group.ssh_sg_1.id]
  snapshot_identifier = data.aws_ssm_parameter.snapshot_name.value
  preferred_maintenance_window = "sun:01:00-sun:03:00"
  preferred_backup_window = "04:00-05:00"
  provider = aws.deployment-eu
}



# Create a security group to allow SSH access
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
  vpc_security_group_ids = [aws_security_group.ssh_sg_1.id]
  provider = aws.deployment-eu
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
  name = "ssm-role-ec2"
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
  value = "mongodb://indyauctionAdmin:${random_password.password.result}@${aws_docdb_cluster.my_documentdb_cluster.endpoint}:27017/${var.STAGE}?authMechanism=SCRAM-SHA-1&authSource=${var.STAGE}&retryWrites=false"
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
  value = aws_security_group.ssh_sg_1.id
  provider = aws.deployment-eu
  overwrite = true
}

resource "aws_default_vpc" "def_vpc"{
  provider = aws.deployment-eu
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
  value = random_password.password.result
  provider = aws.deployment-eu
  overwrite = true
}
output "connection_details" {
  value = {
    endpoint = aws_docdb_cluster.my_documentdb_cluster.endpoint
    port     = "27017"
    ec2_public_ip = aws_instance.ssh_tunnel.public_ip
    shh_tunnel = "ssh -i tf-key-pair-${var.STAGE}.pem -L 27017:${aws_docdb_cluster.my_documentdb_cluster.endpoint}:27017 ubuntu@${aws_instance.ssh_tunnel.public_ip} -Nf"
  }
}
