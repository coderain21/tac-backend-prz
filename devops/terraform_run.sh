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

# Helper function to set up AWS credentials
setup_aws_credentials() {
  local profile="$1"
  local region="$2"
  local trust_anchor_arn="$3"
  local profile_arn="$4"
  local role_arn="$5"

  echo "Setting up AWS credentials for profile: $profile in region: $region"
  aws configure set region "$region" --profile "$profile"
  aws configure set credential_process "$(pwd)/aws_signing_helper credential-process --certificate $CERT_PATH --private-key $KEY_PATH --trust-anchor-arn $trust_anchor_arn --profile-arn $profile_arn --role-arn $role_arn" --profile "$profile"
  
  # Verify configuration 
  aws configure list --profile "$profile"
}

# Helper function specifically for Terraform operations with proper backend config and provider profiles
run_terraform() {
  local directory="$1"
  local action="$2"
  local profile_for_init="$3"       # Profile for terraform init/backend (PROFILE_MAIN)
  local profile_for_resources="$4"  # Profile for resource creation (PROFILE_ENV or PROFILE_ENV-us)
  local bucket="$5"
  local key_prefix="$6"
  shift 6
  local key="${key_prefix}/devops/${directory}/terraform.tfstate"
  
  echo "======================================================="
  echo "Running terraform in devops/$directory"
  echo "  - Init with profile: $profile_for_init (backend)"
  echo "  - Resources with profile: $profile_for_resources"
  echo "  - State bucket: $bucket"
  echo "  - State key: $key"
  echo "======================================================="
  
  # First run terraform init with the PROFILE_MAIN account credentials
  # This is required to access the S3 backend where state is stored
  export AWS_PROFILE="$profile_for_init"
  run_command terraform -chdir="devops/$directory" init \
    -backend-config="bucket=${bucket}" \
    -backend-config="key=$key" \
    -backend-config="profile=${profile_for_init}"
  
  if [ $? -ne 0 ]; then
    echo "ERROR: Terraform init failed for devops/$directory"
    return 1
  fi
  
  # Clear the profile environment variable to avoid conflicts
  unset AWS_PROFILE
  
  # Create/modify provider override settings file for apply/plan
  # This will allow Terraform to use different profiles for different providers
  cat > "devops/$directory/provider_override.tf" <<EOT
# Provider override configuration - auto-generated
provider "aws" {
  # Default provider for this module
  profile = "${profile_for_resources}"
  region  = "eu-west-2"
}

provider "aws" {
  # US-East-1 provider for Route53, ACM etc.
  alias   = "us-east-1"
  profile = "${profile_for_resources}-us"
  region  = "us-east-1"
}

# If there's a specific "route53-account" provider used anywhere
provider "aws" {
  alias   = "route53-account"
  profile = "${profile_for_resources}-us"
  region  = "us-east-1"
}
EOT

  # Now run Terraform apply/plan with explicit AWS_PROFILE for the resource account
  export AWS_PROFILE="$profile_for_resources"
  
  # Always export AWS_SDK_LOAD_CONFIG for consistent AWS SDK behavior
  export AWS_SDK_LOAD_CONFIG=1
  
  # Run the actual apply/plan command with any additional args
  run_command terraform -chdir="devops/$directory" "$action" -auto-approve "$@"
  
  # Reset profile after command
  unset AWS_PROFILE
}

# Get certificate paths from arguments
CERT_PATH="$1"
KEY_PATH="$2"

# Install prerequisites
apt-get update && apt-get install python-is-python3 -y && apt-get install python3-pip -y

# Set up AWS profiles for different regions and accounts
echo "Setting up AWS credentials for all required profiles"
setup_aws_credentials "$PROFILE_ENV" "eu-west-2" "$TRUST_ANCHOR_ARN" "$PROFILE_ARN" "$ROLE_ARN"
setup_aws_credentials "$PROFILE_ENV-us" "us-east-1" "$TRUST_ANCHOR_ARN_US" "$PROFILE_ARN_US" "$ROLE_ARN_US"
setup_aws_credentials "$PROFILE_MAIN" "eu-west-2" "$TRUST_ANCHOR_ARN_MAIN" "$PROFILE_ARN_MAIN" "$ROLE_ARN_MAIN" 

# Always enable AWS SDK config loading
export AWS_SDK_LOAD_CONFIG=1

# Set up QA profile if in pre-production
if [ "${STAGE}" = "pre-production" ] ; then
    echo "Setting up AWS credential process for QA profile"
    setup_aws_credentials "$AWS_ENV_QA" "eu-west-2" "$TRUST_ANCHOR_ARN_QA" "$PROFILE_ARN_QA" "$ROLE_ARN_QA"
fi

# Define S3 bucket for Terraform state (in PROFILE_MAIN account)
log_bucket="indyauction-pipeline-states"
echo "Using Terraform state bucket: $log_bucket in PROFILE_MAIN account"

# Run Terraform for resources
# Format: run_terraform [directory] [action] [profile-for-init] [profile-for-resources] [bucket] [key-prefix]
run_terraform "assets" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
run_terraform "ses" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
run_terraform "admin_web_application" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
run_terraform "seller_web_application" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
run_terraform "api_gateway" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"

# Run Terraform for dependencies
# Dependencies might not need S3 backend, so using simpler approach
export AWS_PROFILE="$PROFILE_ENV"
run_command terraform -chdir=devops/dependency/node init
run_command terraform -chdir=devops/dependency/node apply -auto-approve
run_command terraform -chdir=devops/dependency/nodejs-auth-layer init
run_command terraform -chdir=devops/dependency/nodejs-auth-layer apply -auto-approve
run_command terraform -chdir=devops/dependency/python init
run_command terraform -chdir=devops/dependency/python apply -auto-approve
unset AWS_PROFILE

# Run environment-specific Terraform resources
if [ "${STAGE}" = "prod" ] || [ "${STAGE}" = "qa" ]; then
    run_terraform "mongodb" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
    run_terraform "ecs" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
    run_terraform "redis-cluster" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
fi

if [ "${STAGE}" = "pre-production" ] ; then
    run_terraform "vpc" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
    run_terraform "mongodb_new" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
    run_terraform "redis_cluster_new" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
    run_terraform "ecs_new" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
    run_terraform "mongobetween" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
    
    # Get and export parameters
    parameter_names=(
    "REGION"
    "MONGOBETWEEN_DOCKER_IMAGE"
    "MONGOBETWEEN_ECR_REPO_NAME"
    "MONGOBETWEEN_ECR_REPO_URI"
    "MONGOBETWEEN_ECS_SERVICE_NAME"
    "ECS_CLUSTER_NAME"
    "ACCOUNT_ID"
    )
    
    # Set AWS_PROFILE for parameter retrieval
    export AWS_PROFILE="$PROFILE_ENV"
    
    # Loop through each parameter
    for param_name in "${parameter_names[@]}"; do
        echo "Getting parameter: $param_name"
        param_value=$(aws ssm get-parameter --name "$param_name" --query "Parameter.Value" --output text --region $REGION --profile $PROFILE_ENV)
        export "${param_name##*/}=$param_value"
        echo "Set $param_name as environment variable with value: $param_value"
    done
    
    # Docker operations with appropriate credentials
    echo "docker login --username AWS -p $(aws ecr get-login-password --region $REGION --profile $PROFILE_ENV) https://$ACCOUNT_ID.dkr.ecr.eu-west-2.amazonaws.com" > login.sh
    sh login.sh
    run_command docker build -t $MONGOBETWEEN_ECR_REPO_NAME .
    run_command docker tag $MONGOBETWEEN_ECR_REPO_NAME:latest $MONGOBETWEEN_ECR_REPO_URI
    run_command docker push $MONGOBETWEEN_ECR_REPO_URI
    run_command aws ecs update-service --cluster $ECS_CLUSTER_NAME --service $MONGOBETWEEN_ECS_SERVICE_NAME --force-new-deployment --region $REGION --profile $PROFILE_ENV
    
    unset AWS_PROFILE
fi

# Run other common Terraform modules
run_terraform "secret_manager" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
run_terraform "cloudwatch_alarms" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
run_terraform "budgets" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
run_terraform "stripe_webhook" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"

if [ "${STAGE}" = "prod" ]; then
    run_terraform "cloudwatch" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
    
    run_terraform "mongobetween-prod" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"
    
    # Get and export parameters for prod
    parameter_names=(
    "REGION"
    "MONGOBETWEEN_DOCKER_IMAGE"
    "MONGOBETWEEN_ECR_REPO_NAME"
    "MONGOBETWEEN_ECR_REPO_URI"
    "MONGOBETWEEN_ECS_SERVICE_NAME"
    "ECS_CLUSTER_NAME"
    "ACCOUNT_ID"
    )
    
    export AWS_PROFILE="$PROFILE_ENV"
    
    for param_name in "${parameter_names[@]}"; do
        echo "Getting parameter: $param_name"
        param_value=$(aws ssm get-parameter --name "$param_name" --query "Parameter.Value" --output text --region $REGION --profile $PROFILE_ENV)
        export "${param_name##*/}=$param_value"
        echo "Set $param_name as environment variable with value: $param_value"
    done
    
    echo "docker login --username AWS -p $(aws ecr get-login-password --region $REGION --profile $PROFILE_ENV) https://$ACCOUNT_ID.dkr.ecr.eu-west-2.amazonaws.com" > login.sh
    sh login.sh
    run_command docker build -t $MONGOBETWEEN_ECR_REPO_NAME .
    run_command docker tag $MONGOBETWEEN_ECR_REPO_NAME:latest $MONGOBETWEEN_ECR_REPO_URI
    run_command docker push $MONGOBETWEEN_ECR_REPO_URI
    run_command aws ecs update-service --cluster $ECS_CLUSTER_NAME --service $MONGOBETWEEN_ECS_SERVICE_NAME --force-new-deployment --region $REGION --profile $PROFILE_ENV
    
    unset AWS_PROFILE
fi

# Setup serverless deployments
echo "Installing serverless and dependencies..."
npm i -g serverless@3.15.2
npm i -g @serverless/compose
npm i serverless-aws-documentation
npm i serverless-domain-manager
npm i serverless-dynamodb-autoscaling
npm i serverless-dynamodb-ttl
npm i serverless-offline
npm i serverless-package-external
npm i serverless-python-requirements
npm i serverless-appsync-plugin

export config=serverless.yml

# Setup temporary credentials for serverless deployments with environment variables
echo "Setting up credentials for serverless deployments"
eval $( $(pwd)/aws_signing_helper credential-process \
  --certificate $CERT_PATH \
  --private-key $KEY_PATH \
  --trust-anchor-arn $TRUST_ANCHOR_ARN \
  --profile-arn $PROFILE_ARN \
  --role-arn $ROLE_ARN \
| jq -r '. | "export AWS_ACCESS_KEY_ID=\(.AccessKeyId)\nexport AWS_SECRET_ACCESS_KEY=\(.SecretAccessKey)\nexport AWS_SESSION_TOKEN=\(.SessionToken)"' )

# Deploy serverless services
cd services/cognito-auth
run_command sls deploy --region $REGION --stage $STAGE 
cd ../..
cd services/users
run_command sls deploy --region $REGION --stage $STAGE 
cd ../..
cd services/auctions
run_command sls deploy --region $REGION --stage $STAGE
cd ../..

# Switch back to profile-based auth for buyer_web_application Terraform
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN

# Run Terraform init with PROFILE_MAIN for buyer_web_application
export AWS_PROFILE="$PROFILE_MAIN"
run_command terraform -chdir=devops/buyer_web_application init \
  -backend-config="bucket=${log_bucket}" \
  -backend-config="key=$STAGE/devops/buyer_web_application/terraform.tfstate" \
  -backend-config="profile=${PROFILE_MAIN}"
unset AWS_PROFILE

# Prepare subdomains config
echo "{\"subdomains\": [\"www\"]}" > devops/buyer_web_application/subdomains.json

# Create provider override for buyer_web_application
cat > "devops/buyer_web_application/provider_override.tf" <<EOT
# Provider override configuration - auto-generated
provider "aws" {
  # Default provider for this module
  profile = "${PROFILE_ENV}"
  region  = "eu-west-2"
}

provider "aws" {
  # US-East-1 provider
  alias   = "us-east-1"
  profile = "${PROFILE_ENV}-us"
  region  = "us-east-1"
}
EOT

STATE_FILE="s3://${log_bucket}/$STAGE/devops/buyer_web_application/terraform.tfstate"
# Check if the state file exists in the S3 bucket
if aws s3 ls "$STATE_FILE" --profile "${PROFILE_MAIN}" > /dev/null 2>&1; then
  echo "State file exists. Applying Terraform with targets..."
  # Apply with specific targets
  export AWS_PROFILE="$PROFILE_ENV"
  export AWS_SDK_LOAD_CONFIG=1
  run_command terraform -chdir=devops/buyer_web_application apply -auto-approve \
             -target=aws_amplify_app.customer_web_application \
             -target=aws_amplify_branch.amplify_branch \
             -target=aws_ssm_parameter.amplify_id \
             -target=aws_ssm_parameter.bitbucket_secret \
             -target=data.aws_ssm_parameter.bitbucket \
             -target=data.external.env \
             -target=data.external.token
  unset AWS_PROFILE
else
  # Apply the whole module
  export AWS_PROFILE="$PROFILE_ENV"
  export AWS_SDK_LOAD_CONFIG=1
  run_command terraform -chdir=devops/buyer_web_application apply -auto-approve
  unset AWS_PROFILE
fi

# Run cognito_custom_domain with the correct profile setup
run_terraform "cognito_custom_domain" "apply" "$PROFILE_MAIN" "$PROFILE_ENV" "$log_bucket" "$STAGE"

# Setup temporary credentials for remaining serverless deployments
echo "Setting up credentials for remaining serverless deployments"
eval $( $(pwd)/aws_signing_helper credential-process \
  --certificate $CERT_PATH \
  --private-key $KEY_PATH \
  --trust-anchor-arn $TRUST_ANCHOR_ARN \
  --profile-arn $PROFILE_ARN \
  --role-arn $ROLE_ARN \
| jq -r '. | "export AWS_ACCESS_KEY_ID=\(.AccessKeyId)\nexport AWS_SECRET_ACCESS_KEY=\(.SecretAccessKey)\nexport AWS_SESSION_TOKEN=\(.SessionToken)"' )

# Deploy additional serverless services if in QA or pre-production
if [ "${STAGE}" = "qa" ] || [ "${STAGE}" = "pre-production" ]; then
  cd services/bdd-api
  run_command sls deploy --region $REGION --stage $STAGE
  cd ../..
fi

# Main serverless deployment
run_command sls deploy --stage ${STAGE} --max-concurrency 5
cd services/quicksight-dashboards
run_command sls deploy --region $REGION --stage $STAGE
cd ../..

# Clear serverless credentials
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN

# Set Redis group ID based on environment
if [ "${STAGE}" = "prod" ]; then
    GROUP_ID="websocket-redis-cluster-enabled"
elif [ "${STAGE}" = "pre-production" ]; then
    GROUP_ID="new-websocket-redis-cluster-enabled"
fi

# Final environment-specific configuration using profile authentication
if [ "${STAGE}" = "prod" ] || [ "${STAGE}" = "pre-production" ]; then
    # Set AWS_PROFILE for these commands
    export AWS_PROFILE="$PROFILE_ENV"
    
    run_command aws lambda update-function-configuration \
      --function-name auctions-${STAGE}-save-to-cache \
      --tracing-config Mode=Active \
      --region eu-west-2
      
    run_command aws elasticache modify-replication-group \
      --replication-group-id $GROUP_ID \
      --region eu-west-2 \
      --log-delivery-configurations '[
          {
              "LogType": "slow-log",
              "DestinationType": "cloudwatch-logs",
              "DestinationDetails": {
                  "CloudWatchLogsDetails": {
                  "LogGroup": "redis-slow-logs"
                  }
              },
              "LogFormat": "json",
              "Enabled": true
          },
          {
              "LogType": "engine-log",
              "DestinationType": "cloudwatch-logs",
              "DestinationDetails": {
                  "CloudWatchLogsDetails": {
                  "LogGroup": "redis-engine-logs"
                  }
              },
              "LogFormat": "json",
              "Enabled": true
          }
      ]' \
      --apply-immediately
    
    unset AWS_PROFILE
fi

if [ "${STAGE}" = "pre-production" ]; then
    export AWS_PROFILE="$PROFILE_ENV"
    run_command aws ec2 create-route \
      --route-table-id rtb-03e6b72aede44f529 \
      --destination-cidr-block 172.31.0.0/20 \
      --vpc-peering-connection-id pcx-02b13a02de617b06e \
      --region eu-west-2
    unset AWS_PROFILE
fi

if [ "${STAGE}" = "prod" ] || [ "${STAGE}" = "pre-production" ]; then
    cd devops/disaster_recovery
    run_command ./s3_versioning.sh
    cd ../..
fi

if [ $overall_status -ne 0 ]; then
    echo "One or more commands failed."
    exit 1
else
    echo "All commands executed successfully."
fi