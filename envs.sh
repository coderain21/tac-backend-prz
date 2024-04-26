parameter_names=($(aws ssm describe-parameters --query "Parameters[*].Name" --output text --region $AWS_REGION))
# Loop through each parameter
for param_name in "${parameter_names[@]}"; do
    echo "$param_name"
    # Get parameter value
    param_value=$(aws ssm get-parameter --name "$param_name" --query "Parameter.Value" --output text --region $AWS_REGION)

    # Append to .env file
    echo "${param_name##*/}=$param_value" >> .env  # Write key-value pair to .env file # Write key-value pair to .env file
done
