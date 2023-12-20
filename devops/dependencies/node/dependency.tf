data "external" "env" {
  program = ["../../envs.sh"]
}

#AWS Provider with profile Stage account
provider "aws" {
  region = data.external.env.result["REGION"]
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${data.external.env.result["STAGE"]}"
}


resource "null_resource" "nodejs" {
  provisioner "local-exec" {
    command = "npm i --force && mv node_modules layer/nodejs"
  }
}



resource "aws_lambda_layer_version" "lambda_node_layer" {
  layer_name          = "node_dependency"
  filename            = data.archive_file.node_layer_code_zip.output_path
}

data "archive_file" "node_layer_code_zip" {
  type        = "zip"
  source_dir  = "./layer"
  output_path = "./nodejs.zip"
  depends_on = [resource.null_resource.nodejs]
}

resource "aws_ssm_parameter" "s3_bucket" {
  name  = "COMMON_LIB_ARN"
  overwrite = true
  type  = "String"
  value = aws_lambda_layer_version.lambda_node_layer.arn
  provider = aws.deployment-us
}