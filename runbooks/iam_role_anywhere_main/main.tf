# ----------------------------------------
# AWS Provider for Stage Account (EU-West-2)
# ----------------------------------------
provider "aws" {
  region  = var.REGION
  alias   = "deployment-eu"
}


# Create the ACM PCA certificate authority with the Subject Distinguished Name
resource "aws_acmpca_certificate_authority" "indyauction_ca" {
  type = "ROOT" 
  certificate_authority_configuration {
    key_algorithm            = "RSA_2048"
    signing_algorithm        = "SHA256WITHRSA"

    subject {
      country          = "GB"        # United Kingdom
      state            = "England"
      locality         = "London"
      organization     = "IndyAuction"
      organizational_unit = "IT Department"
      common_name      = "IndyAuction Root CA"
    }
  }

  tags = {
    Name        = "IndyAuction Certificate Authority"
    Environment = "Production"
  }
  provider = aws.deployment-eu

}


# ----------------------------------------
# 1. Create a Trust Anchor from ACM PCA
# ----------------------------------------
resource "aws_rolesanywhere_trust_anchor" "external_pipeline_trust" {
  name    = "external-pipeline-trust"
  enabled = true

  source {
    source_type = "AWS_ACM_PCA"
    source_data {
      acm_pca_arn = aws_acmpca_certificate_authority.indyauction_ca.arn
    }
  }

  provider = aws.deployment-eu
}

# ----------------------------------------
# 2. Create an IAM Role for External CICD
# ----------------------------------------
resource "aws_iam_role" "pipeline_deployer" {
  name = "external-pipeline-deployer"

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
