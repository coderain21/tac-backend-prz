data "external" "env" {
  program = ["../../envs.sh"]
}


provider "aws" {
  region  = "eu-west-2"
}

variable "STAGE" {
  description = "AWS Stage"
  default     = "qa" # Default region if the environment variable is not set
}

resource "null_resource" "python" {
  provisioner "local-exec" {
    command = "pip install -r requirements.txt -t python_lib/python && rm -r python_lib/python/cffi* && rm -r python_lib/python/_cffi_* && cp -a extra/* python_lib/python"
  }
}

resource "aws_lambda_layer_version" "lambda_python_layer" {
  layer_name          = "python_dependency-${data.external.env.result["STAGE"]}"
  filename            = data.archive_file.python_layer_code_zip.output_path
}


data "archive_file" "python_layer_code_zip" {
  type        = "zip"
  source_dir  = "./python_lib"
  output_path = "./python.zip"
  depends_on = [resource.null_resource.python]
}

