from pymongo import MongoClient
import boto3
from botocore.exceptions import ClientError

# === MongoDB Setup ===
client = MongoClient(
    "mongodb://localhost:27017"
)
db = client["pre-production"]
collection = db["pre-production-step-function-arns"]

# === AWS Step Functions Setup ===
stepfunctions = boto3.client("stepfunctions", region_name="eu-west-2")

# === Fetch 50 documents with 'arn' field ===
documents = list(collection.find({"arn": {"$exists": True}}, {"arn": 1, "status": 1}).limit(50000))

for doc in documents:
    arn = doc.get("arn")
    if not arn:
        continue

    try:
        # Describe execution to get current status
        response = stepfunctions.describe_execution(executionArn=arn)
        current_status = response.get("status", "UNKNOWN")
        print(current_status,"current_status")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ExecutionDoesNotExist":
            current_status = "ABORTED"
        else:
            print(f"❌ Error fetching status for ARN {arn}: {str(e)}")
            current_status = "FAILED"

    # Only update if status is different or not present
    if doc.get("status") != current_status:
        result = collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": current_status}}
        )
        print(f"🔁 Updated status for ARN {arn}: {current_status}")
    else:
        print(f"✅ ARN {arn} already has correct status: {current_status}")

print("🏁 Done updating documents.")
