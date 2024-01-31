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
    filename = "tf-key-pair-${data.external.env.result["STAGE"]}.pem"
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


resource "aws_eip" "nat_gateway" {
  vpc = true
  provider = aws.deployment-us
}

resource "aws_nat_gateway" "nat_gateway" {
  allocation_id = aws_eip.nat_gateway.id
  subnet_id = aws_default_subnet.default_az1.id
  tags = {
    "Name" = "NatGateway"
  }
  provider = aws.deployment-us
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
  provider = aws.deployment-us
}

resource "aws_route_table_association" "instance" {
  subnet_id = aws_subnet.mongodb_subnet.id
  route_table_id = aws_route_table.instance.id
  provider = aws.deployment-us
}

data "aws_availability_zones" "available" {
  provider = aws.deployment-us
  }

resource "aws_default_subnet" "default_az1" {
  availability_zone = data.aws_availability_zones.available.names[0]
  provider = aws.deployment-us
}

resource "aws_docdb_cluster_instance" "cluster_instances" {
  identifier         = "docdb-mongodb-instance"
  cluster_identifier = aws_docdb_cluster.my_documentdb_cluster.id
  instance_class     = "db.t3.medium"
  provider = aws.deployment-us
}



# Create the DocumentDB instance
resource "aws_docdb_cluster" "my_documentdb_cluster" {
  cluster_identifier        = "${data.external.env.result["STAGE"]}"
  engine                    = "docdb"
  engine_version            = "5.0.0" # Adjust the version as needed
  db_cluster_parameter_group_name      = aws_docdb_cluster_parameter_group.my_parameter_group.name
  skip_final_snapshot        = true
  master_username         = "${data.external.env.result["MONGO_USERNAME"]}"
  master_password         = "${data.external.env.result["MONGO_PASSWORD"]}"
  vpc_security_group_ids = [aws_security_group.ssh_sg_1.id]
  provider = aws.deployment-us
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
  provider = aws.deployment-us
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
  provider = aws.deployment-us
}


# Create an EC2 instance
resource "aws_instance" "ssh_tunnel" {
  ami           = "ami-0e5f882be1900e43b" # Specify a valid Amazon Linux AMI ID
  instance_type = "t2.micro"          # Choose an appropriate instance type
  key_name = aws_key_pair.my_key.key_name
  vpc_security_group_ids = [aws_security_group.ssh_sg_1.id]
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
  value = "mongodb://${data.external.env.result["MONGO_USERNAME"]}:${data.external.env.result["MONGO_PASSWORD"]}@${aws_docdb_cluster.my_documentdb_cluster.endpoint}:27017/${data.external.env.result["STAGE"]}?authMechanism=DEFAULT&authSource=${data.external.env.result["STAGE"]}&retryWrites=false"
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
  value = aws_security_group.ssh_sg_1.id
  provider = aws.deployment-us
  overwrite = true
}

resource "aws_default_vpc" "def_vpc"{
  provider = aws.deployment-us
}
resource "aws_ssm_parameter" "mongodb-username" {
  name  = "MONGO_USERNAME"
  type  = "String"
  value = data.external.env.result["MONGO_USERNAME"]
  provider = aws.deployment-us
  overwrite = true
}

resource "aws_ssm_parameter" "mongodb-password" {
  name  = "MONGO_PASSWORD"
  type  = "String"
  value = data.external.env.result["MONGO_PASSWORD"]
  provider = aws.deployment-us
  overwrite = true
}
output "connection_details" {
  value = {
    endpoint = aws_docdb_cluster.my_documentdb_cluster.endpoint
    port     = "27017"
    ec2_public_ip = aws_instance.ssh_tunnel.public_ip
    shh_tunnel = "ssh -i tf-key-pair-${data.external.env.result["STAGE"]}.pem -L 27017:${aws_docdb_cluster.my_documentdb_cluster.endpoint}:27017 ubuntu@${aws_instance.ssh_tunnel.public_ip} -Nf"
  }
}
