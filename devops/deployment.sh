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

apt-get update && apt-get install python-is-python3 -y && apt-get install python3-pip -y

# # Configure AWS CLI profiles
aws configure set profile.$PROFILE_MAIN.aws_access_key_id $AWS_ACCESS_KEY_ID_MAIN
aws configure set profile.$PROFILE_MAIN.aws_secret_access_key $AWS_SECRET_ACCESS_KEY_MAIN

aws configure set profile.$PROFILE_ENV.aws_access_key_id $AWS_ACCESS_KEY_ID
aws configure set profile.$PROFILE_ENV.aws_secret_access_key $AWS_SECRET_ACCESS_KEY
if [ "${STAGE}" = "pre-production" ] ; then
    aws configure set profile.$AWS_ENV_QA.aws_access_key_id $AWS_ACCESS_KEY_ID_QA
    aws configure set profile.$AWS_ENV_QA.aws_secret_access_key $AWS_SECRET_ACCESS_KEY_QA
fi
log_bucket="indyauction-pipeline-states"
echo "$log_bucket"
# aws s3 sync $log_bucket . --profile $PROFILE_MAIN


# Print AWS CLI configurations for verification
aws configure list --profile $PROFILE_MAIN
aws configure list --profile $PROFILE_ENV
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
run_command terraform -chdir=devops/ecs init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/ecs_new/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/ecs apply -auto-approve

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
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}


cd services/cognito-auth
sls deploy --region $REGION --stage $STAGE
sls deploy --region $REGION --stage $STAGE
cd ../..
cd services/users
sls deploy --region $REGION --stage $STAGE
sls deploy --region $REGION --stage $STAGE
cd ../..
cd services/lambda-authorizer
sls deploy --region $REGION --stage $STAGE
sls deploy --region $REGION --stage $STAGE
cd ../..
cd services/auctions
sls deploy --region $REGION --stage $STAGE
sls deploy --region $REGION --stage $STAGE
cd ../..
# terraform -chdir=devops/buyer_web_application init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/buyer_web_application/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
terraform -chdir=devops/buyer_web_application init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/buyer_web_application/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
echo "{\"subdomains\": [\"www\"]}" > devops/buyer_web_application/subdomains.json
STATE_FILE="s3://${log_bucket}/$STAGE/devops/buyer_web_application/terraform.tfstate"
# Check if the file exists in the S3 bucket
if aws s3 ls "$STATE_FILE" --profile "${PROFILE_MAIN}" > /dev/null 2>&1; then
  echo "State file exists. Applying Terraform with targets..."
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
run_command sls deploy --stage ${STAGE} --max-concurrency 8

if [ $overall_status -ne 0 ]; then
    echo "One or more commands failed."
    exit 1
else
    echo "All commands executed successfully."
fi

