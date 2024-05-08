parameter_names=(
    "REGION"
    "SELLER_COGNITO_USERPOOL_ID"
    "SELLER_COGNITO_CLIENT_ID"
    "BUYER_COGNITO_USERPOOL_ID"
    "BUYER_COGNITO_CLIENT_ID"
    "ADMIN_COGNITO_USERPOOL_ID"
    "ADMIN_COGNITO_CLIENT_ID"
)
# Loop through each parameter
for param_name in "${parameter_names[@]}"; do
    echo "$param_name"
    # Get parameter value
    param_value=$(aws ssm get-parameter --name "$param_name" --query "Parameter.Value" --output text --region $AWS_REGION)

    # Append to .env file
    echo "${param_name##*/}=$param_value" >> ../.env  # Write key-value pair to .env file
   
    # echo "Added $param_name to .env file with value: $param_value"
done