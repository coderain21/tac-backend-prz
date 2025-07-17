parameter_names=(
    "REGION"
    "SELLER_COGNITO_USERPOOL_ID"
    "SELLER_COGNITO_CLIENT_ID"
    "BUYER_COGNITO_USERPOOL_ID"
    "BUYER_COGNITO_CLIENT_ID"
    "ADMIN_COGNITO_USERPOOL_ID"
    "ADMIN_COGNITO_CLIENT_ID"
    "API_USERNAME"
    "PASSWORD"
    "BUYER_API_USERNAME"
    "BUYER_PASSWORD"
    "ADMIN_USERNAME"
    "ADMIN_PASSWORD"
    "MONGOBETWEEN_DOCKER_IMAGE"
    "MONGOBETWEEN_ECR_REPO_NAME"
    "MONGOBETWEEN_ECR_REPO_URI"
    "MONGOBETWEEN_ECS_SERVICE_NAME"
    "ECS_CLUSTER_NAME"
    "REACT_APP_DOMAIN_NAME_FRONT_END"
)
# Loop through each parameter
for param_name in "${parameter_names[@]}"; do
    echo "$param_name"
    # Get parameter value
    param_value=$(aws ssm get-parameter --name "$param_name" --query "Parameter.Value" --output text --region $REGION --profile $PROFILE_ENV)

    # Append to .env file
    echo "${param_name##*/}=$param_value" >> .env  
   
    # echo "Added $param_name to .env file with value: $param_value"
done
printenv | awk -F= '$1 ~ /^(MONGO_CLIENT|DATABASE|STAGE)$/' >> .env

