from pymongo import MongoClient
import boto3
from datetime import datetime

# === MongoDB Setup ===
client = MongoClient(
    "mongodb://localhost:27017"
)
db = client["prod"]
collection = db["prod-step-function-arns"]

# === Step Functions Client ===
sfn = boto3.client("stepfunctions", region_name="eu-west-2")

# List of lot IDs to check
lot_ids = [
    "68618ccdd0135b4969af368d",
    "68618cf5d0135b4969af368e"

    # Add up to 9 more lot IDs here
]

# === Step 1: Find Duplicate lot_ids ===
pipeline = [
    {
        "$match": {
            "seller_email": "bid@aspenartmuseum.org",
            "auction_id": "A0001", 
            "lot_id": {"$in": lot_ids}  # Match any of the specified lot IDs
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

# Get all running ARNs for these lot_ids
docs = list(collection.find({
    "lot_id": {"$in": lot_ids},
    "seller_email": "bid@aspenartmuseum.org",
    "auction_id": "A0001"
}).sort("created_at", -1))

running_arns = []
for doc in docs:
    arn = doc.get("arn")
    created_at = doc.get("created_at")
    lot_id = doc.get("lot_id")
    created_at_str = created_at.strftime('%Y-%m-%d %H:%M:%S') if isinstance(created_at, datetime) else str(created_at)

    if not arn:
        continue

    try:
        details = sfn.describe_execution(executionArn=arn)
        if details["status"] == "RUNNING":
            running_arns.append((arn, created_at_str, lot_id))
    except Exception as e:
        print(f"  ⚠️ Failed to describe ARN {arn}: {e}")

print(f"\n✅ Found {len(running_arns)} running ARNs")

# Group running ARNs by lot_id
from collections import defaultdict
arns_by_lot = defaultdict(list)
for arn, created_at_str, lot_id in running_arns:
    arns_by_lot[lot_id].append((arn, created_at_str))

# Process each lot_id separately
for lot_id, lot_arns in arns_by_lot.items():
    print(f"\nProcessing lot_id {lot_id}")
    for arn, created_at_str in lot_arns:  # Process all ARNs
        print(f"🟡 RUNNING ARN for lot_id {lot_id} | created_at: {created_at_str} | ARN: {arn}")
        print("🛑 Aborting ARN...")
        try:
            sfn.stop_execution(
                executionArn=arn,
                error="ManualAbort",
                cause=f"Manually aborted execution for lot_id {lot_id}"
            )
            print("✅ Aborted successfully")
        except Exception as e:
            print(f"❌ Failed to abort ARN {arn}: {e}")
        print()  # Add blank line for readability
