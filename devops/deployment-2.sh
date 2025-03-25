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


run_command terraform -chdir=devops/dependency/node init 
run_command terraform -chdir=devops/dependency/node apply -auto-approve
run_command terraform -chdir=devops/dependency/nodejs-auth-layer init
run_command terraform -chdir=devops/dependency/nodejs-auth-layer apply -auto-approve
run_command terraform -chdir=devops/dependency/python init
run_command terraform -chdir=devops/dependency/python apply -auto-approve
run_command terraform -chdir=devops/secret_manager init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/secret_manager/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/secret_manager apply -auto-approve
run_command terraform -chdir=devops/cloudwatch_alarms init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/cloudwatch_alarms/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/cloudwatch_alarms apply -auto-approve
run_command terraform -chdir=devops/budgets init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/budgets/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/budgets apply -auto-approve
run_command terraform -chdir=devops/stripe_webhook init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/devops/stripe_webhook/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=devops/stripe_webhook apply -auto-approve



if [ $overall_status -ne 0 ]; then
    echo "One or more commands failed."
    exit 1
else
    echo "All commands executed successfully."
fi

