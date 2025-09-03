# This script monitors AWS Step Functions executions for a specific state machine
# It filters executions based on an auction ID and seller email
# It retrieves all running executions and their input parameters
# Results are grouped by lot number and displayed with execution details
import boto3
import json
from collections import defaultdict

# --- config ---
REGION = "eu-west-2"
STATE_MACHINE_ARN = "arn:aws:states:eu-west-2:891377257474:stateMachine:prod-lot-published"
AUCTION_ID = "A0001"
SELLER_EMAIL = "abby.bryant@dallascontemporary.org"
# --------------

sf = boto3.client("stepfunctions", region_name=REGION)

def get_running_executions(state_machine_arn):
    executions = []
    paginator = sf.get_paginator("list_executions")
    for page in paginator.paginate(
        stateMachineArn=state_machine_arn,
        statusFilter="RUNNING"
    ):
        executions.extend(page["executions"])
    return executions

def get_execution_input(execution_arn):
    details = sf.describe_execution(executionArn=execution_arn)
    try:
        return json.loads(details["input"])
    except Exception:
        return {}

def main():
    executions = get_running_executions(STATE_MACHINE_ARN)
    print(f"Total running executions: {len(executions)}\n")

    # {lot_number: [(executionArn, start_date, end_date), ...]}
    lot_executions = defaultdict(list)

    for exe in executions:
        data = get_execution_input(exe["executionArn"])
        if (
            data.get("auction_id") == AUCTION_ID
            and data.get("seller_email") == SELLER_EMAIL
        ):
            lot = data.get("lot_number", "UNKNOWN")
            lot_executions[lot].append(
                (
                    exe["executionArn"],
                    data.get("start_date"),
                    data.get("end_date"),
                )
            )

    print(f"Execution details for auction {AUCTION_ID} and seller {SELLER_EMAIL}:")
    for lot, items in sorted(lot_executions.items()):
        print(f"  Lot {lot}: {len(items)} executions")
        for arn, start, end in items:
            print(f"    {arn} (start: {start}, end: {end})")
        print()

if __name__ == "__main__":
    main()
