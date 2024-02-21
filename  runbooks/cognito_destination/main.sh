#!/bin/bash

# Install jq if not already installed
sudo apt-get install jq -y

AWS_REGION="eu-west-2"
DESTINATION_USER_POOL_ID_SELLER=$(aws ssm get-parameter --name "SELLER_COGNITO_USERPOOL_ID" --region $AWS_REGION --with-decryption --output text --query Parameter.Value)

# Download user data file from S3
aws s3 sync s3://indyauction-runbooks/scripts/ . --include "*seller_user_data.json"

# Process user data from the downloaded file
seller_users=$(cat seller_user_data.json)

# Loop through each user object in the JSON array
for user in $(echo "$seller_users" | jq -c '.Users[]'); do
    # Extract username and attributes from the user object
    username=$(echo "$user" | jq -r '.Username')
    attributes=$(echo "$user" | jq -c '.Attributes | map(select(.Name != "sub"))')  # Exclude sub attribute

    # Create user in the destination user pool
    aws cognito-idp admin-create-user --user-pool-id $DESTINATION_USER_POOL_ID_SELLER --region $AWS_REGION --username $username --user-attributes "$attributes" --temporary-password 'temp-password' --message-action 'SUPPRESS'

    echo "User $username created successfully in the destination user pool."
done

echo "User creation completed."

AWS_REGION="eu-west-2"
DESTINATION_USER_POOL_ID_BUYER=$(aws ssm get-parameter --name "BUYER_COGNITO_USERPOOL_ID" --region $AWS_REGION --with-decryption --output text --query Parameter.Value)

# Download user data file from S3
aws s3 sync s3://indyauction-runbooks/scripts/ . --include "*buyer_user_data.json"

# Process user data from the downloaded file
buyer_users=$(cat buyer_user_data.json)

# Loop through each user object in the JSON array
for user in $(echo "$buyer_users" | jq -c '.Users[]'); do
    # Extract username and attributes from the user object
    username=$(echo "$user" | jq -r '.Username')
    attributes=$(echo "$user" | jq -c '.Attributes | map(select(.Name != "sub"))')  # Exclude sub attribute

    # Create user in the destination user pool
    aws cognito-idp admin-create-user --user-pool-id $DESTINATION_USER_POOL_ID_BUYER --region $AWS_REGION --username $username --user-attributes "$attributes" --temporary-password 'temp-password' --message-action 'SUPPRESS'

    echo "User $username created successfully in the destination user pool."
done

echo "User creation completed."