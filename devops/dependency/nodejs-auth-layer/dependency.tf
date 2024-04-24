#AWS Provider with profile Stage account
provider "aws" {
  region = var.REGION
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}


resource "null_resource" "nodejs" {
  provisioner "local-exec" {
    command = "npm i --force && mkdir layer && mv node_modules layer && cd layer && mkdir nodejs && mv node_modules nodejs"
  }
}



resource "aws_lambda_layer_version" "lambda_node_layer" {
  layer_name          = "lambda_auth_layer"
  filename            = data.archive_file.node_layer_code_zip.output_path
  provider = aws.deployment-us
}

data "archive_file" "node_layer_code_zip" {
  type        = "zip"
  source_dir  = "./layer"
  output_path = "./nodejs.zip"
  depends_on = [resource.null_resource.nodejs]
}

resource "aws_ssm_parameter" "s3_bucket" {
  name  = "LAMBDA_AUTH_LIB_NODE_ARN"
  overwrite = true
  type  = "String"
  value = aws_lambda_layer_version.lambda_node_layer.arn
  provider = aws.deployment-us
}