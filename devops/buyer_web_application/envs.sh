#!/bin/bash

# Initialize an empty object for environment variables
env_object="{"

# Fetch parameter names
parameter_names=(
    "REGION"
    "AMPLIFY_DOMAIN_NAME"
    "BUCKET_NAME"
    "BASE_URL_BUYER"
    "DOMAIN_NAME_FRONT_END"
    "SITEKEY"
    "GOOGLE_API_KEY"
    "GOOGLE_API"
    "CDN_URL"
    "STRIPE_KEY"
    "STAGE"
    "LOCATION_API"
    "SOCKET_URL"
    "BUYER_COGNITO_USERPOOL_ID"
    "BUYER_COGNITO_CLIENT_ID"
    "BUYER_COGNITO_IDENTITY_POOL_ID"
    "BUYER_COGNITO_USERPOOL_DOMAIN"
    "LAUNCHDARKLY_CLIENT_ID"
    "SUB_ENC_KEY"
    "VERSION_API_BASE_URL"

)

# Loop through each parameter
first_param=true
for param_name in "${parameter_names[@]}"; do
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