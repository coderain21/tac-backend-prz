data "external" "env" {
  program = ["../../envs.sh"]
}

#AWS Provider with profile Stage account
provider "aws" {
  region = data.external.env.result["REGION"]
  alias = "deployment-us"   # Specify a default AWS region here
  profile = "indyauction-${data.external.env.result["STAGE"]}"
}


resource "null_resource" "python" {
  provisioner "local-exec" {
    command = "mkdir -p python_lib/python && pip install -r requirements.txt -t python_lib/python && rm -r python_lib/python/cffi* && rm -r python_lib/python/_cffi_* && cp -a extra/* python_lib/python"
  }
}

resource "aws_lambda_layer_version" "lambda_python_layer" {
  layer_name          = "python_dependency-${data.external.env.result["STAGE"]}"
  filename            = data.archive_file.python_layer_code_zip.output_path
  provider=aws.deployment-us
}


data "archive_file" "python_layer_code_zip" {
  type        = "zip"
  source_dir  = "./python_lib"
  output_path = "./python.zip"
  depends_on = [resource.null_resource.python]
}

resource "aws_ssm_parameter" "s3_bucket" {
  name  = "/COMMON_LIB_ARN_PYTHON"
  overwrite = true
  type  = "String"
  value = aws_lambda_layer_version.lambda_python_layer.arn
  provider = aws.deployment-us
}

resource "null_resource" "python2" {
  provisioner "local-exec" {
    command = "pip install -r requirements2.txt -t python_lib2/python"
    }
}

resource "aws_lambda_layer_version" "lambda_python_layer_2" {
  layer_name          = "python_dependency-2-${data.external.env.result["STAGE"]}"
  filename            = data.archive_file.python_layer_code_zip_2.output_path
  provider=aws.deployment-us
}


data "archive_file" "python_layer_code_zip_2" {
  type        = "zip"
  source_dir  = "./python_lib2"
  output_path = "./python2.zip"
  depends_on = [resource.null_resource.python2]
}

resource "aws_ssm_parameter" "python_library_2" {
  name  = "/COMMON_LIB_ARN_PYTHON_2"
  overwrite = true
  type  = "String"
  value = aws_lambda_layer_version.lambda_python_layer_2.arn
  provider = aws.deployment-us
}

