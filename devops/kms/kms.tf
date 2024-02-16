data "external" "env" {
    program = ["../envs.sh"]
}

#AWS Provider with profile Stage account
provider "aws" {
    region = data.external.env.result["REGION"]
    alias = "deployment-us"   # Specify a default AWS region here
    profile = "indyauction-${data.external.env.result["STAGE"]}"
}
data "aws_caller_identity" "current" {
    provider = aws.deployment-us
}

resource "aws_kms_key" "example_key" {
    description             = "Terraform KMS Key"
    deletion_window_in_days = 30
    provider = aws.deployment-us

    policy = <<EOF
    {
    "Id": "key-consolepolicy-3",
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "Enable IAM User Permissions",
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
            },
            "Action": "kms:*",
            "Resource": "*"
        }
    ]
    }
    EOF
}

resource "aws_ssm_parameter" "acc_id" {
  name  = "ACCOUNT_ID"
  type  = "String"
  value = data.aws_caller_identity.current.account_id
  provider = aws.deployment-us
  overwrite = true
}
resource "aws_ssm_parameter" "kms_key" {
  name  = "KMS_KEY_ID"
  overwrite = true
  type  = "String"
  value = aws_kms_key.example_key.id
  provider = aws.deployment-us
}