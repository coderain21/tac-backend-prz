#!/bin/sh

# set -a            
# source .env
# set +a
overall_status=0
run_command() {
    "$@"
    local status=$?
    if [ $status -ne 0 ]; then
        overall_status=$status
        echo "Command failed: $@"
    fi
    return $status
}


CERT_PATH="$1"
KEY_PATH="$2" 

apt-get update && apt-get install python-is-python3 -y && apt-get install python3-pip -y

# Function to resolve and write AWS credentials to ~/.aws/credentials
resolve_and_write_credentials() {
  local profile=$1
  local cert_path=$2
  local key_path=$3
  local trust_anchor_arn=$4
  local profile_arn=$5
  local role_arn=$6
  local region=$7

  echo "Fetching credentials for profile: $profile"

  # Fetch credentials using aws_signing_helper
  creds=$(AWS_PROFILE="$profile" $(pwd)/aws_signing_helper credential-process --certificate "$cert_path" --private-key "$key_path" --trust-anchor-arn "$trust_anchor_arn" --profile-arn "$profile_arn" --role-arn "$role_arn")

  # Check if the creds are not empty
  if [[ -z "$creds" ]]; then
    echo "Error: Failed to fetch credentials for $profile"
    exit 1
  fi
  # Also configure region for the profile in the config file
  echo "Setting region for profile: $profile to $region"
  aws configure set region "$region" --profile "$profile"

  # Write the credentials to ~/.aws/credentials
  echo "Writing credentials to ~/.aws/credentials for profile: $profile"
  echo "[$profile]" >> ~/.aws/credentials
  echo "aws_access_key_id = $(echo "$creds" | jq -r .AccessKeyId)" >> ~/.aws/credentials
  echo "aws_secret_access_key = $(echo "$creds" | jq -r .SecretAccessKey)" >> ~/.aws/credentials
  echo "aws_session_token = $(echo "$creds" | jq -r .SessionToken)" >> ~/.aws/credentials

  
}

# Ensure ~/.aws/credentials exists and is clean before writing new data
if [ ! -f ~/.aws/credentials ]; then
  echo "Creating credentials file..."
  touch ~/.aws/credentials
fi
> ~/.aws/credentials

# Configure credentials for PROFILE_MAIN and related profiles
resolve_and_write_credentials "$PROFILE_MAIN-us" "$CERT_PATH" "$KEY_PATH" "$TRUST_ANCHOR_ARN_MAIN_US" "$PROFILE_ARN_MAIN_US" "$ROLE_ARN_MAIN_US" "us-east-1"
resolve_and_write_credentials "$PROFILE_MAIN" "$CERT_PATH" "$KEY_PATH" "$TRUST_ANCHOR_ARN_MAIN" "$PROFILE_ARN_MAIN" "$ROLE_ARN_MAIN" "eu-west-2"
resolve_and_write_credentials "$PROFILE_ENV" "$CERT_PATH" "$KEY_PATH" "$TRUST_ANCHOR_ARN" "$PROFILE_ARN" "$ROLE_ARN" "eu-west-2"
resolve_and_write_credentials "$PROFILE_ENV-us" "$CERT_PATH" "$KEY_PATH" "$TRUST_ANCHOR_ARN_US" "$PROFILE_ARN_US" "$ROLE_ARN_US" "us-east-1"

# Handle stage-specific logic for QUICKSIGHT_ACCOUNT and TF_VAR_ROUTE53_ACCOUNT
if [ "${STAGE}" = "pre-production" ]; then
    echo "Setting up AWS credential process for QA profile"
    resolve_and_write_credentials "$QUICKSIGHT_ACCOUNT" "$CERT_PATH" "$KEY_PATH" "$TRUST_ANCHOR_ARN_QA" "$PROFILE_ARN_QA" "$ROLE_ARN_QA" "eu-west-2"
elif [ "${STAGE}" = "prod" ] || [ "${STAGE}" = "qa" ]; then
    echo "Setting up AWS credential process for QuickSight account"
    resolve_and_write_credentials "$QUICKSIGHT_ACCOUNT" "$CERT_PATH" "$KEY_PATH" "$TRUST_ANCHOR_ARN" "$PROFILE_ARN" "$ROLE_ARN" "eu-west-2"
fi

# Handle Route53 Account for prod and pre-production
if [ "${STAGE}" = "prod" ]; then
    echo "Setting up AWS credential process for Route53 account"
    resolve_and_write_credentials "$TF_VAR_ROUTE53_ACCOUNT" "$CERT_PATH" "$KEY_PATH" "$TRUST_ANCHOR_ARN_MAIN_US" "$PROFILE_ARN_MAIN_US" "$ROLE_ARN_MAIN_US" "us-east-1"
elif [ "${STAGE}" = "pre-production" ] || [ "${STAGE}" = "qa" ]; then
    echo "Setting up AWS credential process for Route53 account"
    resolve_and_write_credentials "$TF_VAR_ROUTE53_ACCOUNT" "$CERT_PATH" "$KEY_PATH" "$TRUST_ANCHOR_ARN_US" "$PROFILE_ARN_US" "$ROLE_ARN_US" "us-east-1"
fi

# Enabling AWS SDK config loading
export AWS_SDK_LOAD_CONFIG=1

# Confirm AWS credentials and configuration
run_command aws sts get-caller-identity --profile "${PROFILE_MAIN}"
run_command aws sts get-caller-identity --profile "${PROFILE_MAIN}-us"
run_command aws sts get-caller-identity --profile "${PROFILE_ENV}"
run_command aws sts get-caller-identity --profile "${PROFILE_ENV}-us"
run_command aws sts get-caller-identity --profile "${QUICKSIGHT_ACCOUNT}"
run_command aws sts get-caller-identity --profile "${TF_VAR_ROUTE53_ACCOUNT}"

log_bucket="indyauction-pipeline-states"
echo "$log_bucket"


# Print AWS CLI configurations for verification
aws configure list --profile "${PROFILE_MAIN}"
aws configure list --profile "${PROFILE_MAIN}-us"
aws configure list --profile "${PROFILE_ENV}"
aws configure list --profile "${PROFILE_ENV}-us"


run_command terraform -chdir=devops/disaster_recovery/redis init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/mongodb/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/disaster_recovery/redis apply -auto-approve
run_command terraform -chdir=devops/disaster_recovery/mongo_db init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/redis-cluster/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/disaster_recovery/mongo_db apply -auto-approve


if [ $overall_status -ne 0 ]; then
    echo "One or more commands failed."
    exit 1
else
    echo "All commands executed successfully."
fi