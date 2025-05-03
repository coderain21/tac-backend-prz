# ----------------------------------------
# AWS Provider for Stage Account (EU-West-2)
# ----------------------------------------
provider "aws" {
  region  = var.REGION
  alias   = "deployment-eu"
}


terraform {
  backend "s3" {
    region       = "eu-west-2"  # Replace with the appropriate AWS region
    encrypt      = true
    use_lockfile = true  # Enable the S3 locking feature
  }
}
# -----------------------------
# 1. Create a Trust Anchor
# -----------------------------
resource "aws_rolesanywhere_trust_anchor" "external_pipeline_trust" {
  name = "external-pipeline-trust"

  source {
    source_type = "CERTIFICATE_BUNDLE"
    source_data {
      x509_certificate_data = file("ca.crt") # Your trusted CA bundle (PEM)
    }
  }
  enabled = true
  provider = aws.deployment-eu
}

# ----------------------------------------
# 2. Create an IAM Role for External CICD
# ----------------------------------------
resource "aws_iam_role" "pipeline_deployer" {
  name = "external-pipeline-deployer-${var.REGION}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = {
        Service = "rolesanywhere.amazonaws.com"
      },
      Action = [
        "sts:AssumeRole",
        "sts:TagSession",
        "sts:SetSourceIdentity"
      ],
      Condition = {
        StringEquals = {
          "aws:PrincipalTag/x509Subject/CN" = "indyauction-internal-ca"
        },
        ArnEquals = {
          "aws:SourceArn" = aws_rolesanywhere_trust_anchor.external_pipeline_trust.arn
        }
      }
    }]
  })

  provider = aws.deployment-eu
}

# ----------------------------------------
# 3. Attach Deployment Permissions (Broad Example)
# ----------------------------------------
resource "aws_iam_role_policy" "pipeline_access_policy" {
  name   = "deployment-access"
  role   = aws_iam_role.pipeline_deployer.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["*"],
        Resource = ["*"]
      }
    ]
  })

  provider = aws.deployment-eu
}

# ----------------------------------------
# 4. Create a RolesAnywhere Profile
# ----------------------------------------
resource "aws_rolesanywhere_profile" "pipeline_profile" {
  name                        = "pipeline-profile"
  role_arns                   = [aws_iam_role.pipeline_deployer.arn]
  require_instance_properties = false
  enabled                     = true
  duration_seconds            = 3600

  provider = aws.deployment-eu
}
