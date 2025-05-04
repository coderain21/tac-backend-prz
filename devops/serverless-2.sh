#!/bin/sh

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



if [ "${STAGE}" = "qa" ] || [ "${STAGE}" = "pre-production" ]; then
  cd services/bdd-api
  run_command sls deploy --region $REGION --stage $STAGE
  cd ../..
fi
run_command sls deploy --stage ${STAGE} --max-concurrency 5
cd services/quicksight-dashboards
run_command sls deploy --region $REGION --stage $STAGE
cd ../..


if [ "${STAGE}" = "prod" ]; then
    GROUP_ID="websocket-redis-cluster-enabled"
elif [ "${STAGE}" = "pre-production" ]; then
    GROUP_ID="new-websocket-redis-cluster-enabled"
fi



if [ "${STAGE}" = "prod" ] || [ "${STAGE}" = "pre-production" ]; then
    run_command aws lambda update-function-configuration --function-name auctions-${STAGE}-save-to-cache --tracing-config Mode=Active --region eu-west-2
    run_command aws elasticache modify-replication-group \
    --replication-group-id $GROUP_ID \
    --region eu-west-2 \
    --log-delivery-configurations '[
        {
            "LogType": "slow-log",
            "DestinationType": "cloudwatch-logs",
            "DestinationDetails": {
                "CloudWatchLogsDetails": {
                "LogGroup": "redis-slow-logs"
                }
            },
            "LogFormat": "json",
            "Enabled": true
        },
        {
            "LogType": "engine-log",
            "DestinationType": "cloudwatch-logs",
            "DestinationDetails": {
                "CloudWatchLogsDetails": {
                "LogGroup": "redis-engine-logs"
                }
            },
            "LogFormat": "json",
            "Enabled": true
        }
    ]' \
    --apply-immediately

fi
if [ "${STAGE}" = "pre-production" ]; then
    run_command aws ec2 create-route --route-table-id rtb-03e6b72aede44f529 --destination-cidr-block 172.31.0.0/20 --vpc-peering-connection-id pcx-02b13a02de617b06e --region eu-west-2
fi
if [ "${STAGE}" = "prod" ] || [ "${STAGE}" = "pre-production" ]; then
    cd devops/disaster_recovery
    run_command ./s3_versioning.sh
fi

if [ $overall_status -ne 0 ]; then
    echo "One or more commands failed."
    exit 1
else
    echo "All commands executed successfully."
fi