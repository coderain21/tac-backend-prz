from pymongo import MongoClient
import boto3
# from datetime import datetime
import uuid


# === MongoDB Setup ===
client = MongoClient("Mongodbstring")  # Replace with actual MongoDB URI
db = client["prod"]
collection = db["prod-step-function-arns"]

# === Step Functions Client ===
sfn = boto3.client("stepfunctions", region_name="eu-west-2")

# === Input Parameters ===
lot_id = "688b34b147213ace3aa48a8d"
auction_id = "A2083"
seller_email = "sthuthi+test3@7edge.com"

# === Step 1: Get all ARNs for the given lot_id ===
docs = list(collection.find({
    "lot_id": lot_id,
    "seller_email": seller_email,
    "auction_id": auction_id
}).sort("created_at", -1))

to_restart = []

print(f"\n🔍 Checking {len(docs)} executions for lot_id {lot_id}...\n")

print('docs', docs)

for doc in docs:
    arn = doc.get("arn")
    state_machine_arn = doc.get("state_machine_arn")  # Needed for restart
    input_payload = doc.get("input")  # This should be a JSON string

    if not arn:
        print(f"⚠️ Skipping due to missing data: arn/state_machine_arn/input")
        continue

    try:
        details = sfn.describe_execution(executionArn=arn)
        status = details["status"]
        print(f"🔸 Execution ARN: {arn} | Status: {status}")

        if status != "RUNNING":
            to_restart.append({
                "state_machine_arn": state_machine_arn,
                "input": input_payload,
                "original_arn": arn
            })

    except Exception as e:
        print(f"⚠️ Failed to describe execution {arn}: {e}")
        continue

# === Step 2: Restart all non-running executions ===
print(f"\n🔁 Restarting {len(to_restart)} aborted/non-running executions...\n")

for item in to_restart:
    try:
        response = sfn.start_execution(
            stateMachineArn=item["state_machine_arn"],
            input=item["input"],
            name=f"restarted-{uuid.uuid4()}"  # Ensure unique name
        )
        print(f"✅ Restarted execution from original ARN: {item['original_arn']}")
        print(f"   ➤ New execution ARN: {response['executionArn']}\n")
    except Exception as e:
        print(f"❌ Failed to restart execution from {item['original_arn']}: {e}\n")
