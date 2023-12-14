
#!/bin/sh

# set -a            
# source .env
# set +a

apt-get update && apt-get install python -y && apt-get install python3-pip -y

# Configure AWS CLI profiles
aws configure set profile.$PROFILE_MAIN.aws_access_key_id $AWS_ACCESS_KEY_ID_MAIN
aws configure set profile.$PROFILE_MAIN.aws_secret_access_key $AWS_SECRET_ACCESS_KEY_MAIN

aws configure set profile.$PROFILE_ENV.aws_access_key_id $AWS_ACCESS_KEY_ID
aws configure set profile.$PROFILE_ENV.aws_secret_access_key $AWS_SECRET_ACCESS_KEY

aws s3 sync s3://indyauction-$STAGE-pipeline-logs/ . --profile $PROFILE_ENV

# Print AWS CLI configurations for verification
aws configure list --profile $PROFILE_MAIN
aws configure list --profile $PROFILE_ENV


terraform -chdir=devops/assets init
terraform -chdir=devops/assets apply -auto-approve
terraform -chdir=devops/admin_web_application init
terraform -chdir=devops/admin_web_application apply -auto-approve
terraform -chdir=devops/api_gateway init
terraform -chdir=devops/api_gateway apply -auto-approve
terraform -chdir=devops/dependencies/node init
terraform -chdir=devops/dependencies/node apply -auto-approve
terraform -chdir=devops/dependencies/python init
terraform -chdir=devops/dependencies/python apply -auto-approve
if [ "STAGE" = "prod" ]; then
    terraform -chdir=devops/mongodb init
    terraform -chdir=devops/mongodb apply -auto-approve
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


aws s3 sync . s3://indyauction-$STAGE-pipeline-logs/ --exclude "*" --include "*.tfstate" --include "*tf-key-pair" --profile $PROFILE_ENV

