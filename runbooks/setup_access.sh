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


apt-get update && apt-get install python-is-python3 -y && apt-get install python3-pip -y



log_bucket="indyauction-pipeline-states"
echo "$log_bucket"


# Print AWS CLI configurations for verification
aws configure list --profile $PROFILE_MAIN
aws configure list --profile $BASE_PROFILE
terraform -chdir=runbooks/iam_role_anywhere init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/runbooks/iam_role_anywhere/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
terraform -chdir=runbooks/iam_role_anywhere init -backend-config="bucket=${log_bucket}" -backend-config="key=$STAGE/runbooks/us/iam_role_anywhere/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=runbooks/iam_role_anywhere apply -auto-approve
terraform -chdir=runbooks/iam_role_anywhere_main init -backend-config="bucket=${log_bucket}" -backend-config="key=main/runbooks/iam_role_anywhere_main/terraform.tfstate" -backend-config="profile=${PROFILE_MAIN}"
run_command terraform -chdir=runbooks/iam_role_anywhere_main apply -auto-approve
if [ $overall_status -ne 0 ]; then
    echo "One or more commands failed."
    exit 1
else
    echo "All commands executed successfully."
fi