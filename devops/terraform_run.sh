#!/bin/sh

# set -a            
# source .env
# set +a

apt-get update && apt-get install python-is-python3 -y && apt-get install python3-pip -y

# # Configure AWS CLI profiles
aws configure set profile.$PROFILE_MAIN.aws_access_key_id $AWS_ACCESS_KEY_ID_MAIN
aws configure set profile.$PROFILE_MAIN.aws_secret_access_key $AWS_SECRET_ACCESS_KEY_MAIN

aws configure set profile.$PROFILE_ENV.aws_access_key_id $AWS_ACCESS_KEY_ID
aws configure set profile.$PROFILE_ENV.aws_secret_access_key $AWS_SECRET_ACCESS_KEY

log_bucket="s3://indyauction-pipeline-states/$STAGE/"
echo "$log_bucket"
aws s3 sync $log_bucket . --profile $PROFILE_MAIN

# Print AWS CLI configurations for verification
aws configure list --profile $PROFILE_MAIN
aws configure list --profile $PROFILE_ENV
terraform -chdir=devops/assets init
terraform -chdir=devops/assets apply -auto-approve
terraform -chdir=devops/ses init
terraform -chdir=devops/ses apply -auto-approve
terraform -chdir=devops/admin_web_application init
terraform -chdir=devops/admin_web_application apply -auto-approve
terraform -chdir=devops/seller_web_application init
terraform -chdir=devops/seller_web_application apply -auto-approve
terraform -chdir=devops/api_gateway init
terraform -chdir=devops/api_gateway apply -auto-approve
terraform -chdir=devops/dependency/node init
terraform -chdir=devops/dependency/node apply -auto-approve
terraform -chdir=devops/dependency/nodejs-auth-layer init
terraform -chdir=devops/dependency/nodejs-auth-layer apply -auto-approve
terraform -chdir=devops/dependency/python init
terraform -chdir=devops/dependency/python apply -auto-approve
terraform -chdir=devops/mongodb init
terraform -chdir=devops/mongodb apply -auto-approve
terraform -chdir=devops/ecs init
terraform -chdir=devops/ecs apply -auto-approve
terraform -chdir=devops/cloudwatch_alarms init
terraform -chdir=devops/cloudwatch_alarms apply -auto-approve
terraform -chdir=devops/redis-cluster init
terraform -chdir=devops/redis-cluster apply -auto-approve
terraform -chdir=devops/budgets init
terraform -chdir=devops/budgets apply -auto-approve
if [ "${STAGE}" = "prod" ]; then
    terraform -chdir=devops/cloudwatch init
    terraform -chdir=devops/cloudwatch apply -auto-approve
fi
aws s3 sync . $log_bucket --exclude "*" --include "*.tfstate" --include "*tf-key-pair*" --exclude "*/dependency/*" --profile $PROFILE_MAIN
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
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}


cd services/cognito-auth
sls deploy --region $REGION --stage $STAGE
cd ../..
cd services/users
sls deploy --region $REGION --stage $STAGE
cd ../..
cd services/lambda-authorizer
sls deploy --region $REGION --stage $STAGE
cd ../..
cd services/auctions
sls deploy --region $REGION --stage $STAGE
cd ../..
terraform -chdir=devops/cognito_custom_domain init
terraform -chdir=devops/cognito_custom_domain apply -auto-approve
terraform -chdir=devops/buyer_web_application init
STATE_FILE="devops/buyer_web_application/terraform.tfstate"
# Check if the state file exists
if [ -f "$STATE_FILE" ]; then
  # Extract the DOMAIN_ASSOCIATION_ID only if the state file exists
  DOMAIN_ASSOCIATION_ID=$(terraform state show aws_amplify_domain_association.domain_association | grep -oP '^\s*id\s*=\s*"\K[^"]+')
  
  # Use the extracted ID (if any) in your subsequent commands
  echo "Extracted DOMAIN_ASSOCIATION_ID: $DOMAIN_ASSOCIATION_ID"
  terraform -chdir=devops/buyer_web_application state rm aws_amplify_domain_association.domain_association
  terraform import aws_amplify_domain_association.domain_association $DOMAIN_ASSOCIATION_ID
  # Add your commands here that use $DOMAIN_ASSOCIATION_ID (if needed)
else
  echo "Terraform state file '$STATE_FILE' not found. Skipping..."
fi
terraform -chdir=devops/buyer_web_application apply -auto-approve
aws s3 sync . $log_bucket --exclude "*" --include "*.tfstate" --include "*tf-key-pair*" --exclude "*/dependency/*" --profile $PROFILE_MAIN
sls deploy --stage ${STAGE} --max-concurrency 5

