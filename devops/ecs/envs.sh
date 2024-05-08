#!/bin/bash

# Initialize an empty object for environment variables
env_object="{"

# Fetch parameter names
parameter_names=(
    "MONGODB_CONNECTION_STRING"
    "BUYER_COGNITO_USERPOOL_ID"
    "STAGE"
    "REGION"
    "REDIS_CLUSTER_ENDPOINT"
    "STATE_MACHINE_LOT_ARN"
    "WEB_PUSH_SECRET_KEY"
)

# Loop through each parameter
first_param=true
for param_name in "${parameter_names[@]}"; do
    # Get parameter value
    param_value=$(aws ssm get-parameter --name "$param_name" --query "Parameter.Value" --output text --region "$REGION" --profile "$PROFILE_ENV")
    
    # Append key-value pair to environment object
    if [ "$first_param" = true ]; then
        env_object="$env_object\"$param_name\": \"$param_value\""
        first_param=false
    else
        env_object="$env_object, \"$param_name\": \"$param_value\""
    fi
done

# Close the environment object
env_object="$env_object}"

# Write JSON to file
echo "$env_object"