#!/bin/bash

AWS_REGION="eu-west-2"

SOURCE_USER_POOL_ID=$(aws ssm get-parameter --name "BUYER_COGNITO_USERPOOL_ID" --with-decryption --region $AWS_REGION --output text --query Parameter.Value)

# List users in the source user pool
users=$(aws cognito-idp list-users --user-pool-id $SOURCE_USER_POOL_ID --region $AWS_REGION --output json)

# Output user data to a file
echo "$users" > buyer_user_data.json 

aws s3 sync . s3://indyauction-runbooks/scripts/ --exclude "*" --include "buyer_user_data.json" --acl public-read

SOURCE_USER_POOL_ID=$(aws ssm get-parameter --name "SELLER_COGNITO_USERPOOL_ID" --with-decryption --region $AWS_REGION --output text --query Parameter.Value)

# List users in the source user pool
users=$(aws cognito-idp list-users --user-pool-id $SOURCE_USER_POOL_ID --region $AWS_REGION --output json)

# Output user data to a file
echo "$users" > seller_user_data.json 

aws s3 sync . s3://indyauction-runbooks/scripts/ --exclude "*" --include "seller_user_data.json" --acl public-read