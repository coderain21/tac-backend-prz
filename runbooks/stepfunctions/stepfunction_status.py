from pymongo import MongoClient
import boto3
from datetime import datetime

# === MongoDB Setup ===
client = MongoClient("mongodb string")  # Replace with actual MongoDB URI
db = client["prod"]
collection = db["prod-step-function-arns"]

# === Step Functions Client ===
sfn = boto3.client("stepfunctions", region_name="eu-west-2")

# === Input Parameters ===
lot_id = "688b34b147213ace3aa48a8d"
auction_id = "A2083"
seller_email = "sthuthi+test3@7edge.com"

# === Fetch All Executions for Given lot_id ===
docs = list(collection.find({
    "lot_id": lot_id,
    "auction_id": auction_id,
    "seller_email": seller_email
}).sort("created_at", -1))

print(f"\n🔍 Found {len(docs)} executions for lot_id: {lot_id}\n")

# === Describe Execution Status ===
for doc in docs:
    arn = doc.get("arn")
    created_at = doc.get("created_at")
    created_str = created_at.strftime('%Y-%m-%d %H:%M:%S') if isinstance(created_at, datetime) else str(created_at)

    if not arn:
        print("⚠️ Skipping missing ARN.")
        continue

    try:
        details = sfn.describe_execution(executionArn=arn)
        status = details.get("status")
        start_time = details.get("startDate")
        stop_time = details.get("stopDate")

        print(f"🔸 ARN: {arn}")
        print(f"   📅 Created At: {created_str}")
        print(f"   🔁 Status: {status}")
        print(f"   ▶️ Start Time: {start_time}")
        print(f"   ⏹ Stop Time: {stop_time}\n")

    except Exception as e:
        print(f"❌ Failed to fetch status for {arn}: {e}\n")
