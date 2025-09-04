# This script monitors AWS Step Functions executions for a specific state machine
# It filters executions based on an auction ID and seller email
# It retrieves all running executions and their input parameters
# It also queries MongoDB to fetch lot details (start/end date)
# Results are grouped by lot number and displayed with both DB and execution details
# Executions are marked as Latest or Duplicate based on actual execution start time

import boto3
import json
from collections import defaultdict
from pymongo import MongoClient
from datetime import datetime

# --- config ---
REGION = "eu-west-2"
STATE_MACHINE_ARN = "arn:aws:states:eu-west-2:891377257474:stateMachine:prod-lot-published"
AUCTION_ID = "A0001"
SELLER_EMAIL = "abby.bryant@dallascontemporary.org"

# MongoDB connection (adjust URI to your setup)
MONGO_URI = "mongodb://localhost:3000"
DB_NAME = "prod"
COLLECTION_NAME = "prod-lots"
# --------------

sf = boto3.client("stepfunctions", region_name=REGION)
mongo_client = MongoClient(MONGO_URI)
lots_collection = mongo_client[DB_NAME][COLLECTION_NAME]


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


def get_db_lot_data(auction_id, seller_email):
    """Fetch lot data from MongoDB for given auction and seller."""
    lot_data = {}
    query = {"auction_id": auction_id, "seller_email": seller_email}
    docs = lots_collection.find(query)

    for doc in docs:
        lot = doc.get("lot_number")

        # keep start_date as stored
        start_val = doc.get("start_date")
        if isinstance(start_val, dict):
            start = start_val.get("$numberLong")
        else:
            start = start_val

        # keep end_date as stored
        end_val = doc.get("end_date")
        if isinstance(end_val, dict):
            end = end_val.get("$numberLong")
        else:
            end = end_val

        lot_data[lot] = {"start_date": start, "end_date": end}
    return lot_data


def format_dt(dt_obj):
    """Format datetime nicely for printing"""
    return dt_obj.strftime("%Y-%m-%d %H:%M:%S")


def main():
    executions = get_running_executions(STATE_MACHINE_ARN)
    print(f"Total running executions: {len(executions)}\n")

    # {lot_number: [(executionArn, exec_start_time, input_start, input_end, lot_end_time), ...]}
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
                    exe["startDate"],            # real execution start time
                    data.get("start_date"),
                    data.get("end_date"),
                    data.get("lot_end_time"),
                )
            )

    # fetch DB data
    db_data = get_db_lot_data(AUCTION_ID, SELLER_EMAIL)

    print(f"Execution details for auction {AUCTION_ID} and seller {SELLER_EMAIL}:")
    for lot, items in sorted(lot_executions.items()):
        print(f"  Lot {lot}: {len(items)} executions")

        # print DB data for this lot
        if lot in db_data:
            db_start = db_data[lot].get("start_date")
            db_end = db_data[lot].get("end_date")
            print(f"  DB (start: {db_start}, end: {db_end})")
        else:
            print("  DB (no record found)")

        # sort executions by real Step Functions start time (latest first)
        items_sorted = sorted(items, key=lambda x: x[1], reverse=True)

        for idx, (arn, exec_start_time, start, end, lot_end_time) in enumerate(items_sorted):
            label = "Latest" if idx == 0 else "Duplicate"
            exec_time_str = format_dt(exec_start_time)
            print(f"    [{label}] {arn} (ExecutionTime: {exec_time_str}, start: {start}, end: {end}, lot_end_time: {lot_end_time})")

        print()


if __name__ == "__main__":
    main()
