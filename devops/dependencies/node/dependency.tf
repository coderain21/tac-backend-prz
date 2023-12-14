provider "aws" {
  region  = "eu-west-2"
  profile = "indyauction-dev" # Use the AWS profile for the source account
}

resource "null_resource" "nodejs" {
  provisioner "local-exec" {
    command = "npm i --force && mv node_modules nodejs"
  }
}

resource "aws_lambda_layer_version" "lambda_node_layer" {
  layer_name          = "node_dependency"
  filename            = data.archive_file.node_layer_code_zip.output_path
}

data "archive_file" "node_layer_code_zip" {
  type        = "zip"
  source_dir  = "./nodejs"
  output_path = "./nodejs.zip"
  depends_on = [resource.null_resource.nodejs]
}
