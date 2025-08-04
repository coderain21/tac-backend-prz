from pymongo import MongoClient
import boto3
from datetime import datetime

# === MongoDB Setup ===
client = MongoClient(
    "mongodb://localhost:27017"
)
db = client["pre-production"]
collection = db["pre-production-step-function-arns"]

# === Step Functions Client ===
sfn = boto3.client("stepfunctions", region_name="eu-west-2")

# === Step 1: Find Duplicate lot_ids ===
pipeline = [
    {
        "$match": {
            "seller_email": "namratha.shettigar+stripe@7edge.com",
            "auction_id": "A0283"
        }
    },
    {
        "$group": {
            "_id": "$lot_id",
            "count": { "$sum": 1 }
        }
    },
    {
        "$match": {
            "count": { "$gt": 1 }
        }
    }
]

duplicate_lot_ids = [doc["_id"] for doc in collection.aggregate(pipeline)]
print(f"\n✅ Found {len(duplicate_lot_ids)} duplicate lot_ids")

for lot_id in duplicate_lot_ids:
    # 🔹 Get all documents for the lot_id, newest first
    docs = list(collection.find({
        "lot_id": lot_id,
        "seller_email": "namratha.shettigar+stripe@7edge.com",
        "auction_id": "A0283"
    }).sort("created_at", -1))

    running_arns = []


    for doc in docs:
        arn = doc.get("arn")
        created_at = doc.get("created_at")
        created_at_str = created_at.strftime('%Y-%m-%d %H:%M:%S') if isinstance(created_at, datetime) else str(created_at)

        if not arn:
            continue

        try:
            details = sfn.describe_execution(executionArn=arn)
            if details["status"] == "RUNNING":
                running_arns.append((arn, created_at_str))
        except Exception as e:
            print(f"  ⚠️ Failed to describe ARN {arn}: {e}")

    if running_arns:
    
        print(f"\n🔵 LATEST RUNNING ARN for lot_id {lot_id} | created_at: {running_arns[0][1]} | ARN: {running_arns[0][0]}")

        for arn, created_at_str in running_arns[1:]:  # Skip the first (latest)

            print(f"🟡 DUPLICATE RUNNING ARN for lot_id {lot_id} | created_at: {created_at_str} | ARN: {arn}")
            print("🛑 Aborting DUPLICATE RUNNING ARN:")
            try:
                sfn.stop_execution(
                    executionArn=arn,
                    error="DuplicateExecution",
                    cause=f"Aborted because a newer execution exists for lot_id {lot_id}"
                )
                print("✅ Aborted successfully")
            except Exception as e:
                print(f"❌ Failed to abort ARN {arn}: {e}")
