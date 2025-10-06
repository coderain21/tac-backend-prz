provider "aws" {
  region = "eu-west-2"
  profile = "indyauction-dev"
}

# S3 Bucket for TAC Archive
resource "aws_s3_bucket" "tac_archive" {
  bucket = "tac-archive-3rdparty"

  tags = {
    Name        = "TAC Archive"
    Purpose     = "Archive and backup of old TAC site"
    Vendor      = "SteadyGo"
  }
}

terraform {
  backend "s3" {
    region       = "eu-west-2"  # Replace with the appropriate AWS region
    encrypt      = true
    use_lockfile = true  # Enable the S3 locking feature
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "tac_archive_pab" {
  bucket = aws_s3_bucket.tac_archive.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Versioning for backup protection
resource "aws_s3_bucket_versioning" "tac_archive_versioning" {
  bucket = aws_s3_bucket.tac_archive.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Lifecycle configuration for archival
resource "aws_s3_bucket_lifecycle_configuration" "tac_archive_lifecycle" {
  bucket = aws_s3_bucket.tac_archive.id

  rule {
    id     = "tac_archive_lifecycle"
    status = "Enabled"

    filter {}

    transition {
      days          = 30
      storage_class = "GLACIER"
    }

    transition {
      days          = 120
      storage_class = "DEEP_ARCHIVE"
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_transition {
      noncurrent_days = 60
      storage_class   = "GLACIER"
    }
  }
}

output "s3_bucket_name" {
  value = aws_s3_bucket.tac_archive.bucket
}

output "s3_bucket_arn" {
  value = aws_s3_bucket.tac_archive.arn
}