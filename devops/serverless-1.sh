#!/bin/sh

# set -a            
# source .env
# set +a
overall_status=0
run_command() {
    "$@"
    local status=$?
    if [ $status -ne 0 ]; then
        overall_status=$status
        echo "Command failed: $@"
    fi
    return $status
}
CERT_PATH="$1"
KEY_PATH="$2" 

apt-get update && apt-get install python-is-python3 -y && apt-get install python3-pip -y

npm i -g @serverless/compose
npm i serverless-aws-documentation
npm i serverless-domain-manager
npm i serverless-dynamodb-autoscaling
npm i serverless-dynamodb-ttl
npm i serverless-offline
npm i serverless-package-external
npm i serverless-python-requirements
npm i serverless-appsync-plugin
export config=serverless.yml

eval $( $(pwd)/aws_signing_helper credential-process \
  --certificate $CERT_PATH \
  --private-key $KEY_PATH \
  --trust-anchor-arn $TRUST_ANCHOR_ARN \
  --profile-arn $PROFILE_ARN \
  --role-arn $ROLE_ARN \
| jq -r '. | "export AWS_ACCESS_KEY_ID=\(.AccessKeyId)\nexport AWS_SECRET_ACCESS_KEY=\(.SecretAccessKey)\nexport AWS_SESSION_TOKEN=\(.SessionToken)"' )



cd services/cognito-auth
run_command sls deploy --region $REGION --stage $STAGE 
cd ../..
cd services/users
run_command sls deploy --region $REGION --stage $STAGE 
cd ../..
# cd services/lambda-authorizer
# run_command sls deploy --region $REGION --stage $STAGE
# cd ../..
cd services/auctions
run_command sls deploy --region $REGION --stage $STAGE
cd ../..


if [ $overall_status -ne 0 ]; then
    echo "One or more commands failed."
    exit 1
else
    echo "All commands executed successfully."
fi