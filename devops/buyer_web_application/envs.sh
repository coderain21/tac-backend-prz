#!/bin/sh

# Initialize an empty object for environment variables
env_object="{"

# Fetch parameter names
parameter_names=$(aws ssm describe-parameters --query "Parameters[*].Name" --output text --region "$REGION" --profile "$PROFILE_ENV")

# Loop through each parameter
first_param=true
for param_name in $parameter_names; do
    # Get parameter value
    param_value=$(aws ssm get-parameter --name "$param_name" --query "Parameter.Value" --output text --region "$REGION" --profile "$PROFILE_ENV")
    
    # Append key-value pair to environment object
    if [ "$first_param" = true ]; then
        env_object="$env_object\"NEXT_PUBLIC_$param_name\": \"$param_value\""
        first_param=false
    else
        env_object="$env_object, \"NEXT_PUBLIC_$param_name\": \"$param_value\""
    fi
done

# Close the environment object
env_object="$env_object}"

# Write JSON to file
echo "$env_object"