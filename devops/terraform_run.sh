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

log_bucket="s3://indyauction-$STAGE-pipeline-logs/"
echo "$log_bucket"
aws s3 sync $log_bucket . --profile $PROFILE_ENV

# Print AWS CLI configurations for verification
aws configure list --profile $PROFILE_MAIN
aws configure list --profile $PROFILE_ENV


terraform -chdir=devops/assets init
terraform -chdir=devops/assets apply -auto-approve
terraform -chdir=devops/admin_web_application init
terraform -chdir=devops/admin_web_application apply -auto-approve
terraform -chdir=devops/seller_web_application init
terraform -chdir=devops/seller_web_application apply -auto-approve
terraform -chdir=devops/api_gateway init
terraform -chdir=devops/api_gateway apply -auto-approve
git diff --quiet --exit-code HEAD -- devops/dependency/node || {
  # If changes are found, execute the desired command
  echo "Changes detected in the devops folder!"
  # Replace "your_command_here" with the actual command you want to run
  terraform -chdir=devops/dependency/node init
  terraform -chdir=devops/dependency/node apply -auto-approve
}


git diff --quiet --exit-code HEAD -- devops/dependency/nodejs-auth-layer || {
  # If changes are found, execute the desired command
  echo "Changes detected in the devops folder!"
  # Replace "your_command_here" with the actual command you want to run
  terraform -chdir=devops/dependency/nodejs-auth-layer init
  terraform -chdir=devops/dependency/nodejs-auth-layer apply -auto-approve
}

git diff --quiet --exit-code HEAD -- devops/dependency/python || {
  # If changes are found, execute the desired command
  echo "Changes detected in the devops folder!"
  # Replace "your_command_here" with the actual command you want to run
  terraform -chdir=devops/dependency/python init
  terraform -chdir=devops/dependency/python apply -auto-approve
}
terraform -chdir=devops/kms init
terraform -chdir=devops/kms apply -auto-approve
terraform -chdir=devops/mongodb init
terraform -chdir=devops/mongodb apply -auto-approve
if [ "STAGE" = "qa" ]; then
    terraform -chdir=devops/dependencies/bitbucket-layer-node init
    terraform -chdir=devops/dependencies/bitbucket-layer-node apply -auto-approve
fi

parameter_names=($(aws ssm describe-parameters --query "Parameters[*].Name" --output text --profile $PROFILE_ENV))

# Loop through each parameter
for param_name in "${parameter_names[@]}"; do
    echo "$param_name"
    # Get parameter value
    param_value=$(aws ssm get-parameter --name "$param_name" --query "Parameter.Value" --output text --profile $PROFILE_ENV)

    # Set environment variable
    export "${param_name##*/}=$param_value"  # Set env var without the path, if the parameter name includes a path

    echo "Set $param_name as environment variable with value: $param_value"
done <<< "$parameter_names"


aws s3 sync . $log_bucket --exclude "*" --include "*.tfstate" --include "*tf-key-pair*" --exclude "*/dependencies/*" --profile $PROFILE_ENV


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
sls deploy --stage ${STAGE} --max-concurrency 5