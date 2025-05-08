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
run_command terraform -chdir=devops/assets init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/assets/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/assets apply -auto-approve
run_command terraform -chdir=devops/ses init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/ses/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/ses apply -auto-approve
run_command terraform -chdir=devops/admin_web_application init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/admin_web_application/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/admin_web_application apply -auto-approve
run_command terraform -chdir=devops/seller_web_application init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/seller_web_application/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/seller_web_application apply -auto-approve
run_command terraform -chdir=devops/api_gateway init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/api_gateway/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/api_gateway apply -auto-approve
run_command terraform -chdir=devops/dependency/node init 
run_command terraform -chdir=devops/dependency/node apply -auto-approve
run_command terraform -chdir=devops/dependency/nodejs-auth-layer init
run_command terraform -chdir=devops/dependency/nodejs-auth-layer apply -auto-approve
run_command terraform -chdir=devops/dependency/python init
run_command terraform -chdir=devops/dependency/python apply -auto-approve

if [ "${STAGE}" = "prod" ] || [ "${STAGE}" = "qa" ]; then
    run_command terraform -chdir=devops/mongodb init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/mongodb/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
    run_command terraform -chdir=devops/mongodb apply -auto-approve
    run_command terraform -chdir=devops/ecs init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/ecs/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
    run_command terraform -chdir=devops/ecs apply -auto-approve
    run_command terraform -chdir=devops/redis-cluster init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/redis-cluster/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
    run_command terraform -chdir=devops/redis-cluster apply -auto-approve
fi
if [ "${STAGE}" = "pre-production" ] ; then
    run_command terraform -chdir=devops/vpc init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/vpc/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
    run_command terraform -chdir=devops/vpc apply -auto-approve
    # terraform -chdir=devops/ecs init
    # terraform -chdir=devops/ecs destroy -auto-approve 
    # terraform -chdir=devops/redis-cluster init
    # terraform -chdir=devops/redis-cluster destroy -auto-approve
    # terraform -chdir=devops/mongodb init
    # terraform -chdir=devops/mongodb destroy -auto-approve
    run_command terraform -chdir=devops/mongodb_new init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/mongodb_new/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
    run_command terraform -chdir=devops/mongodb_new apply -auto-approve
    run_command terraform -chdir=devops/redis_cluster_new init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/redis_cluster_new/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
    run_command terraform -chdir=devops/redis_cluster_new apply -auto-approve
    run_command terraform -chdir=devops/ecs_new init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/ecs_new/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
    run_command terraform -chdir=devops/ecs_new apply -auto-approve
fi

if [ "${STAGE}" = "pre-production" ]; then
    run_command terraform -chdir=devops/mongobetween init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/mongobetween/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
    run_command terraform -chdir=devops/mongobetween apply -auto-approve

    parameter_names=(
    "REGION"
    "MONGOBETWEEN_DOCKER_IMAGE"
    "MONGOBETWEEN_ECR_REPO_NAME"
    "MONGOBETWEEN_ECR_REPO_URI"
    "MONGOBETWEEN_ECS_SERVICE_NAME"
    "ECS_CLUSTER_NAME"
    "ACCOUNT_ID"
    )

    # Loop through each parameter
    for param_name in "${parameter_names[@]}"; do
        echo "$param_name"
        # Get parameter value
        param_value=$(aws ssm get-parameter --name "$param_name" --query "Parameter.Value" --output text  --region $REGION --profile $PROFILE_ENV)

        # Set environment variable
        export "${param_name##*/}=$param_value"  # Set env var without the path, if the parameter name includes a path

        echo "Set $param_name as environment variable with value: $param_value"
    done <<< "$parameter_names"

    echo docker login --username AWS -p $(aws ecr get-login-password --region $REGION --profile $PROFILE_ENV) https://$ACCOUNT_ID.dkr.ecr.eu-west-2.amazonaws.com  > login.sh
    sh login.sh
    run_command docker build -t $MONGOBETWEEN_ECR_REPO_NAME .
    run_command docker tag $MONGOBETWEEN_ECR_REPO_NAME:latest $MONGOBETWEEN_ECR_REPO_URI
    run_command docker push $MONGOBETWEEN_ECR_REPO_URI
    run_command aws ecs update-service --cluster $ECS_CLUSTER_NAME --service $MONGOBETWEEN_ECS_SERVICE_NAME --region $REGION --profile $PROFILE_ENV --force-new-deployment
fi

if [ "${STAGE}" = "prod"  ]; then

    run_command terraform -chdir=devops/mongobetween-prod init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/mongobetween-prod/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
    run_command terraform -chdir=devops/mongobetween-prod apply -auto-approve
   

    parameter_names=(
    "REGION"
    "MONGOBETWEEN_DOCKER_IMAGE"
    "MONGOBETWEEN_ECR_REPO_NAME"
    "MONGOBETWEEN_ECR_REPO_URI"
    "MONGOBETWEEN_ECS_SERVICE_NAME"
    "ECS_CLUSTER_NAME"
    "ACCOUNT_ID"
    )

    # Loop through each parameter
    for param_name in "${parameter_names[@]}"; do
        echo "$param_name"
        # Get parameter value
        param_value=$(aws ssm get-parameter --name "$param_name" --query "Parameter.Value" --output text --region $REGION --profile $PROFILE_ENV)

        # Set environment variable
        export "${param_name##*/}=$param_value"  # Set env var without the path, if the parameter name includes a path

        echo "Set $param_name as environment variable with value: $param_value"
    done <<< "$parameter_names"

    echo docker login --username AWS -p $(aws ecr get-login-password --region $REGION --profile $PROFILE_ENV) https://$ACCOUNT_ID.dkr.ecr.eu-west-2.amazonaws.com  > login.sh
    sh login.sh
    run_command docker build -t $MONGOBETWEEN_ECR_REPO_NAME .
    run_command docker tag $MONGOBETWEEN_ECR_REPO_NAME:latest $MONGOBETWEEN_ECR_REPO_URI
    run_command docker push $MONGOBETWEEN_ECR_REPO_URI
    run_command aws ecs update-service --cluster $ECS_CLUSTER_NAME --service $MONGOBETWEEN_ECS_SERVICE_NAME --region $REGION --profile $PROFILE_ENV --force-new-deployment
fi

run_command terraform -chdir=devops/secret_manager init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/secret_manager/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/secret_manager apply -auto-approve
run_command terraform -chdir=devops/cloudwatch_alarms init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/cloudwatch_alarms/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/cloudwatch_alarms apply -auto-approve
run_command terraform -chdir=devops/budgets init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/budgets/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/budgets apply -auto-approve
run_command terraform -chdir=devops/stripe_webhook init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/stripe_webhook/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/stripe_webhook apply -auto-approve
if [ "${STAGE}" = "prod" ]; then
    run_command terraform -chdir=devops/cloudwatch init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/cloudwatch/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
    run_command terraform -chdir=devops/cloudwatch apply -auto-approve
fi
# aws s3 sync . $log_bucket --exclude "*" --include "*.tfstate" --include "*tf-key-pair*" --exclude "*/dependency/*" --profile $PROFILE_MAIN
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
unset AWS_PROFILE
eval $( $(pwd)/aws_signing_helper credential-process \
  --certificate $CERT_PATH \
  --private-key $KEY_PATH \
  --trust-anchor-arn $TRUST_ANCHOR_ARN \
  --profile-arn $PROFILE_ARN \
  --role-arn $ROLE_ARN \
| jq -r '. | "export AWS_ACCESS_KEY_ID=\(.AccessKeyId)\nexport AWS_SECRET_ACCESS_KEY=\(.SecretAccessKey)\nexport AWS_SESSION_TOKEN=\(.SessionToken)"' )



cd services/cognito-auth
run_command sls deploy --region $REGION --stage $STAGE 
cd ../..
cd services/users
run_command sls deploy --region $REGION --stage $STAGE 
cd ../..
# cd services/lambda-authorizer
# run_command sls deploy --region $REGION --stage $STAGE
# cd ../..
cd services/auctions
run_command sls deploy --region $REGION --stage $STAGE
cd ../..
# terraform -chdir=devops/buyer_web_application init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/buyer_web_application/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN
run_command terraform -chdir=devops/buyer_web_application init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/buyer_web_application/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
echo "{\"subdomains\": [\"www\"]}" > devops/buyer_web_application/subdomains.json
STATE_FILE="s3://${log_bucket}/$STAGE/devops/buyer_web_application/terraform.tfstate"
# Check if the file exists in the S3 bucket
if aws s3 ls "$STATE_FILE" --profile "${PROFILE_MAIN}" > /dev/null 2>&1; then
  echo "State file exists. Applying Terraform with targets..."
# STATE_FILE="$STAGE/devops/buyer_web_application/terraform.tfstate"
# if [ -f "$STATE_FILE" ]; then
#     echo "cheching for subdomain"
  # Extract the DOMAIN_ASSOCIATION_ID only if the state file exists
#   DOMAIN_ASSOCIATION_ID=$(terraform -chdir=devops/buyer_web_application state show aws_amplify_domain_association.domain_association | grep -oP '^\s*id\s*=\s*"\K[^"]+')
#   APP_ID=$(terraform -chdir=devops/buyer_web_application state show aws_amplify_domain_association.domain_association | grep -oP '^\s*app_id\s*=\s*"\K[^"]+')
#   AMPLIFY_DOMAIN_NAME=$(terraform -chdir=devops/buyer_web_application state show aws_amplify_domain_association.domain_association | grep -oP '^\s*domain_name\s*=\s*"\K[^"]+')
  
#   # Use the extracted ID (if any) in your subsequent commands
#   echo "Extracted DOMAIN_ASSOCIATION_ID: $DOMAIN_ASSOCIATION_ID"
#   terraform -chdir=devops/buyer_web_application state rm aws_amplify_domain_association.domain_association
#   terraform -chdir=devops/buyer_web_application import aws_amplify_domain_association.domain_association $DOMAIN_ASSOCIATION_ID
#   domain=$(aws amplify get-domain-association --app-id $APP_ID --domain-name $AMPLIFY_DOMAIN_NAME --profile $PROFILE_ENV --region $REGION --query 'domainAssociation.subDomains[*].subDomainSetting.prefix')
#   echo "{\"subdomains\": $domain}" > devops/buyer_web_application/subdomains.json
  # Add your commands here that use $DOMAIN_ASSOCIATION_ID (if needed)
  # terraform -chdir=devops/buyer_web_application apply -auto-approve -target=aws_amplify_app.customer_web_application \
  run_command terraform -chdir=devops/buyer_web_application apply -auto-approve -target=aws_amplify_app.customer_web_application \
               -target=aws_amplify_branch.amplify_branch \
               -target=aws_ssm_parameter.amplify_id \
               -target=aws_ssm_parameter.bitbucket_secret \
               -target=data.aws_ssm_parameter.bitbucket \
               -target=data.external.env \
               -target=data.external.token
else
  run_command terraform -chdir=devops/buyer_web_application apply -auto-approve
  #terraform -chdir=devops/buyer_web_application apply -auto-approveSS
fi
run_command terraform -chdir=devops/cognito_custom_domain init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/cognito_custom_domain/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/cognito_custom_domain apply -auto-approve
# terraform -chdir=devops/cognito_custom_domain init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/cognito_custom_domain/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
# terraform -chdir=devops/cognito_custom_domain apply -auto-approve
# aws s3 sync . $log_bucket --exclude "*" --include "*.tfstate" --include "*tf-key-pair*" --exclude "*/dependency/*" --profile $PROFILE_MAIN
unset AWS_PROFILE
eval $( $(pwd)/aws_signing_helper credential-process \
  --certificate $CERT_PATH \
  --private-key $KEY_PATH \
  --trust-anchor-arn $TRUST_ANCHOR_ARN \
  --profile-arn $PROFILE_ARN \
  --role-arn $ROLE_ARN \
| jq -r '. | "export AWS_ACCESS_KEY_ID=\(.AccessKeyId)\nexport AWS_SECRET_ACCESS_KEY=\(.SecretAccessKey)\nexport AWS_SESSION_TOKEN=\(.SessionToken)"' )

if [ "${STAGE}" = "qa" ] || [ "${STAGE}" = "pre-production" ]; then
  cd services/bdd-api
  sls deploy --region $REGION --stage $STAGE
  cd ../..
fi
run_command sls deploy --stage ${STAGE} --max-concurrency 5
cd services/quicksight-dashboards
run_command sls deploy --region $REGION --stage $STAGE
cd ../..


if [ "${STAGE}" = "prod" ]; then
    GROUP_ID="websocket-redis-cluster-enabled"
elif [ "${STAGE}" = "pre-production" ]; then
    GROUP_ID="new-websocket-redis-cluster-enabled"
fi



if [ "${STAGE}" = "prod" ] || [ "${STAGE}" = "pre-production" ]; then
    run_command aws lambda update-function-configuration --function-name auctions-${STAGE}-save-to-cache --tracing-config Mode=Active --region $REGION --profile $PROFILE_ENV
    run_command aws elasticache modify-replication-group \
    --replication-group-id $GROUP_ID \
    --region $REGION \
    --profile $PROFILE_ENV \
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

fi
if [ "${STAGE}" = "pre-production" ]; then
    run_command aws ec2 create-route --route-table-id rtb-03e6b72aede44f529 --destination-cidr-block 172.31.0.0/20 --vpc-peering-connection-id pcx-02b13a02de617b06e --region $REGION --profile $PROFILE_ENV
fi
if [ "${STAGE}" = "prod" ] || [ "${STAGE}" = "pre-production" ]; then
    cd devops/disaster_recovery
    run_command ./s3_versioning.sh
fi

if [ $overall_status -ne 0 ]; then
    echo "One or more commands failed."
    exit 1
else
    echo "All commands executed successfully."
fi