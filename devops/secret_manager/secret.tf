
#AWS Provider with profile Stage account
provider "aws" {
  region = var.REGION
  alias = "deployment-eu"   # Specify a default AWS region here
  profile = "indyauction-${var.STAGE}"
}
provider "aws" {
  region = var.REGION
  alias = "deployment-main"   # Specify a default AWS region here
  profile = "indyauction-qa"
}


# Step 1: Create IAM Role and store ARN in SSM
resource "aws_iam_role" "athena_ambda_role" {
  name               = "athena-lambda-role"
  provider = aws.deployment-main
  assume_role_policy = jsonencode({
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Service": "lambda.amazonaws.com"  # Adjust as per your service requirements
        },
        "Action": "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_ssm_parameter" "role_arn" {
  name  = "ROLE_ARN"
  type  = "String"
  value = aws_iam_role.athena_ambda_role.arn
  provider = aws.deployment-main
}

# Step 2: Create KMS key with policy
resource "aws_kms_key" "kms_key" {
  description             = "KMS key for SecretsManager ${var.STAGE}"
  depends_on = [resource.aws_iam_role.athena_ambda_role]
  provider  = aws.deployment-eu
  deletion_window_in_days = 10
  policy = jsonencode({
    "Version": "2012-10-17",
    "Id": "key-consolepolicy-3",
    "Statement": [
      {
        "Sid": "Enable IAM User Permissions",
        "Effect": "Allow",
        "Principal": {
          "AWS": "arn:aws:iam::${var.ACCOUNT_ID}:root"  # Replace with your root AWS account
        },
        "Action": "kms:*",
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Principal": {
          "AWS": aws_iam_role.athena_ambda_role.arn
        },
        "Action": [
          "kms:Decrypt",
          "kms:DescribeKey"
        ],
        "Resource": "*"
      }
    ]
  })
}

# Step 3: Create Secrets Manager secret for DocumentDB
resource "aws_secretsmanager_secret" "documentdb_secret" {
  name = "documentdb-secret-${var.STAGE}-value"
  description = "Secret for DocumentDB credentials"
  kms_key_id = aws_kms_key.kms_key.arn
  depends_on = [resource.aws_kms_key.kms_key]
  provider  = aws.deployment-eu

}

# Step 4: Set resource policy on the secret to allow IAM role access
resource "aws_secretsmanager_secret_policy" "documentdb_secret_policy" {
  depends_on = [resource.aws_secretsmanager_secret.documentdb_secret]
  secret_arn = aws_secretsmanager_secret.documentdb_secret.arn
  provider  = aws.deployment-eu
  policy = jsonencode({
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "AWS": aws_iam_role.athena_ambda_role.arn
        },
        "Action": "secretsmanager:GetSecretValue",
        "Resource": "*"
      }
    ]
  })
}

# Output the username and password from SSM Parameter Store
data "aws_ssm_parameter" "documentdb_password" {
  name = "MONGO_PASSWORD"  
   provider  = aws.deployment-eu # Assuming the password for DocumentDB is stored here
}

# Attach policy to IAM role granting access to KMS and Secrets Manager
resource "aws_iam_role_policy_attachment" "athena_ambda_role_policy_attachment" {
  role       = aws_iam_role.athena_ambda_role.name
  depends_on = [resource.aws_secretsmanager_secret_policy.documentdb_secret_policy]
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  provider = aws.deployment-main
}
# Define the inline S3 access policy
resource "aws_iam_role_policy" "athena_lambda_s3_policy" {
  name   = "AthenaLambdaS3Policy"
  role   = aws_iam_role.athena_ambda_role.name
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:*"
        ]
        Resource = [
          "*"
        ]
      }
    ]
  })
  provider = aws.deployment-main
}

resource "aws_iam_role_policy_attachment" "athena_ambda_role_cloudwatch_logs" {
  role       = aws_iam_role.athena_ambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  depends_on = [resource.aws_secretsmanager_secret_policy.documentdb_secret_policy]
  provider = aws.deployment-main
}

resource "aws_iam_role_policy_attachment" "athena_ambda_role_cloudwatch" {
  role       = aws_iam_role.athena_ambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
  depends_on = [resource.aws_secretsmanager_secret_policy.documentdb_secret_policy]
  provider = aws.deployment-main
}

# IAM Role in Dev Account
resource "aws_iam_role" "quicksight_access_role" {
  provider = aws.deployment-main
  name     = "quicksight-access-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          AWS = "arn:aws:iam::${var.ACCOUNT_ID}:root"
        },
        Action = "sts:AssumeRole"
      }
    ]
  })
}
# IAM Policy in Dev Account
resource "aws_iam_policy" "quicksight_access_policy" {
  provider = aws.deployment-main
  name     = "quicksight-access-policy"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "quicksight:*",
        ],
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_policy" "quicksight_access_policy_new" {
  provider = aws.deployment-eu
  name     = "quicksight-access-policy-${var.STAGE}"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "quicksight:*",
        ],
        Resource = "*"
      }
    ]
  })
}

# Attach Policy to Role in Dev Account
resource "aws_iam_role_policy_attachment" "attach_quicksight_policy" {
  provider  = aws.deployment-main
  role      = aws_iam_role.quicksight_access_role.name
  policy_arn = aws_iam_policy.quicksight_access_policy.arn
}


# IAM Role for Lambda in Pre-production Account
resource "aws_iam_role" "lambda_execution_role" {
  provider = aws.deployment-eu
  name     = "lambda-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        },
        Action = "sts:AssumeRole"
      }
    ]
  })
}
resource "aws_iam_role_policy_attachment" "attach_quicksight_lambda_policy" {
  provider  = aws.deployment-eu
  role      = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.quicksight_access_policy_new.arn
}

resource "aws_iam_role_policy" "lambda_assume_role_policy" {
  provider = aws.deployment-eu
  role     = aws_iam_role.lambda_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = "sts:AssumeRole",
        Resource = "arn:aws:iam::${var.ACCOUNT_ID_MAIN}:role/quicksight-access-role"
      }
    ]
  })
}


resource "aws_iam_role_policy_attachment" "lambda_execution_role_policy_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  depends_on = [resource.aws_secretsmanager_secret_policy.documentdb_secret_policy]
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  provider = aws.deployment-eu
}

resource "aws_iam_role_policy_attachment" "lambda_execution_role_cloudwatch_logs" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  depends_on = [resource.aws_secretsmanager_secret_policy.documentdb_secret_policy]
  provider = aws.deployment-eu
}

resource "aws_iam_role_policy_attachment" "lambda_execution_role_cloudwatch" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
  depends_on = [resource.aws_secretsmanager_secret_policy.documentdb_secret_policy]
  provider = aws.deployment-eu
}

resource "aws_ssm_parameter" "quiksight_role_arn" {
  name  = "QUICKSIGHT_LAMBDA_ROLE_ARN"
  type  = "String"
  value = aws_iam_role.lambda_execution_role.arn
  provider = aws.deployment-eu
}
resource "aws_ssm_parameter" "quiksight_assume_role_arn" {
  name  = "QUICKSIGHT_ASSUME_ROLE_ARN"
  type  = "String"
  value = aws_iam_role.quicksight_access_role.arn
  provider = aws.deployment-eu
}




