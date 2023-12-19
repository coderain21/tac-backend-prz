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
    command = "npm i --force && mv node_modules nodejs"
  }
}



resource "aws_lambda_layer_version" "lambda_node_layer" {
  layer_name          = "lambda_bitbucket_layer"
  filename            = data.archive_file.node_layer_code_zip.output_path
}

data "archive_file" "node_layer_code_zip" {
  type        = "zip"
  source_dir  = "./nodejs"
  output_path = "./nodejs.zip"
  depends_on = [resource.null_resource.nodejs]
}
