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
  profile = "indyauction-prod"
}


resource "aws_vpc" "mongodb_vpc" {
  cidr_block = "10.0.0.0/16"
  provider = aws.deployment-us
}

# Create a subnet within the VPC
resource "aws_subnet" "mongodb_subnet" {
  vpc_id     = aws_vpc.mongodb_vpc.id
  cidr_block = "10.0.0.0/24"
  provider = aws.deployment-us
}

#######################

resource "aws_key_pair" "my_key"{
    key_name = "tf-key-pair"
    public_key = tls_private_key.rsa.public_key_openssh
    provider = aws.deployment-us
  
}
resource "tls_private_key" "rsa"{
    algorithm = "RSA"
    rsa_bits  = 4096
}
resource "local_file" "tf-key"{
    content  = tls_private_key.rsa.private_key_pem
    filename = "tf-key-pair.pem"
}

########################


resource "aws_docdb_cluster_parameter_group" "my_parameter_group" {
  name        = "${data.external.env.result["STAGE"]}-parameter-group"
  family      = "docdb5.0" # Adjust the family to match your DocumentDB version
  description = "My DocumentDB Parameter Group"
  parameter {
    name  = "tls"
    value = "disabled"
  }
  provider = aws.deployment-us
}


resource "aws_docdb_cluster_instance" "cluster_instances" {
  identifier         = "docdb-mongodb-instance"
  cluster_identifier = aws_docdb_cluster.my_documentdb_cluster.id
  instance_class     = "db.t4g.medium"
  provider = aws.deployment-us
}



# Create the DocumentDB instance
resource "aws_docdb_cluster" "my_documentdb_cluster" {
  cluster_identifier        = "${data.external.env.result["STAGE"]}"
  engine                    = "docdb"
  engine_version            = "5.0.0" # Adjust the version as needed
  db_cluster_parameter_group_name      = aws_docdb_cluster_parameter_group.my_parameter_group.name
  skip_final_snapshot        = true
  master_username         = "indyauctionmaster"
  master_password         = "masterindyauction"
  vpc_security_group_ids = [aws_security_group.ssh_sg.id]
  provider = aws.deployment-us
}



# Create a security group to allow SSH access
resource "aws_security_group" "ssh_sg" {
  name        = "ssh-security-group"
  description = "SSH Security Group"
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


# Create an EC2 instance
resource "aws_instance" "ssh_tunnel" {
  ami           = "ami-0cfd0973db26b893b" # Specify a valid Amazon Linux AMI ID
  instance_type = "t2.micro"          # Choose an appropriate instance type
  key_name = aws_key_pair.my_key.key_name
  vpc_security_group_ids = [aws_security_group.ssh_sg.id]
  provider = aws.deployment-us
  # User data to create the SSH tunnel
  user_data = <<-EOF
              #!/bin/bash
              wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-archive-keyring.gpg
              echo "deb [signed-by=/usr/share/keyrings/mongodb-archive-keyring.gpg] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/5.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list
              sudo apt-get update -y
              sudo apt-get install -y mongodb-mongosh 
              EOF
}

resource "aws_eip" "example" {
  instance = aws_instance.ssh_tunnel.id # Replace with your EC2 instance ID
  provider = aws.deployment-us
}

resource "aws_ssm_parameter" "documentdb" {
  name  = "MONGODB_CONNECTION_STRING"
  type  = "String"
  value = "mongodb://${data.aws_ssm_parameter.mongodb-username.value}:${data.aws_ssm_parameter.mongodb-password.value}@${aws_docdb_cluster.my_documentdb_cluster.endpoint}:27017/?replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false"
  provider = aws.deployment-us
  overwrite = true
}

resource "aws_ssm_parameter" "subnet_id" {
  name  = "SUBNET_ID"
  type  = "String"
  value = aws_subnet.mongodb_subnet.id
  provider = aws.deployment-us
  overwrite = true
}

resource "aws_ssm_parameter" "security_group_id" {
  name  = "SECURITY_GROUP_ID"
  type  = "String"
  value = aws_security_group.ssh_sg.id
  provider = aws.deployment-us
  overwrite = true
}

data "aws_ssm_parameter" "mongodb-username" {
  name = "MONGO_USERNAME"
  provider = aws.deployment-us
}
data "aws_ssm_parameter" "mongodb-password" {
  name = "MONGO_PASSWORD"
  provider = aws.deployment-us
}

data "aws_organizations_organization" "org" {
  provider = aws.main
}

data "aws_organizations_organizational_unit_child_accounts" "accounts" {
  parent_id = data.aws_organizations_organization.org.roots[0].id
  provider = aws.main
}

# Get the current AWS account ID
data "aws_caller_identity" "current" {
  provider = aws.deployment-us
}

# Filter out the current account from the list of child accounts
locals {
  all_accounts_except_current = [
    for account in data.aws_organizations_organizational_unit_child_accounts.accounts.accounts :
    account.id if account.id != data.aws_caller_identity.current.account_id
  ]
}

resource "aws_default_vpc" "default" {
  provider = aws.deployment-us
}



resource "aws_ram_resource_share" "share_vpc" {
  name               = "vpc-share"
  provider = aws.deployment-us
  allow_external_principals = true
}

resource "aws_ram_resource_association" "example" {
  resource_arn       = aws_subnet.mongodb_subnet.arn
  resource_share_arn = aws_ram_resource_share.share_vpc.arn
  provider = aws.deployment-us
}