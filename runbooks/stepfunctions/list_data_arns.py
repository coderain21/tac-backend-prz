# This script queries MongoDB to find step function executions for lots in auction A0001
# It retrieves lot dates from the prod-lots collection and checks AWS Step Functions
# for running executions, displaying the latest execution details and any duplicates
# for each lot ID. The script helps identify and monitor running step functions.

from pymongo import MongoClient
import boto3
from datetime import datetime
import json

# === MongoDB Setup ===
client = MongoClient(
    "mongodb://localhost:27017"
)

db = client["prod"]
collection = db["prod-step-function-arns"]
lots_collection = db["prod-lots"]

# === Step Functions Client === 
sfn = boto3.client("stepfunctions", region_name="eu-west-2")

# Get unique lot_ids
unique_lots = collection.distinct("lot_id", {
    "seller_email": "bid@aspenartmuseum.org",
    "auction_id": "A0001"
})

print(f"🔢 Found {len(unique_lots)} unique lot_ids")

# Get lot dates from prod-lots collection
lot_dates = {}
from bson import ObjectId
object_ids = []
for lot_id in unique_lots:
    try:
        object_ids.append(ObjectId(lot_id))
    except:
        print(f"⚠️ Invalid ObjectId: {lot_id}")

for lot in lots_collection.find({
    "seller_email": "bid@aspenartmuseum.org",
    "auction_id": "A0001",
    "_id": {"$in": object_ids}
}):
    start_date = lot.get("start_date")
    end_date = lot.get("end_date")
    if isinstance(start_date, (int, float)):
        start_date = datetime.fromtimestamp(start_date / 1000)
    if isinstance(end_date, (int, float)):
        end_date = datetime.fromtimestamp(end_date / 1000)
    
    lot_dates[str(lot["_id"])] = {
        "start_date": start_date,
        "end_date": end_date
    }

# Process each lot_id separately
for lot_id in unique_lots:
    print(f"\n🏷️ LOT ID: {lot_id}")
    
    # Print lot dates from DB
    if lot_id in lot_dates:
        print(f"📅 DB DATA:")
        print(f"  Start: {lot_dates[lot_id]['start_date']}")
        print(f"  End: {lot_dates[lot_id]['end_date']}")
    else:
        print(f"❌ No DB data found")

    # Get all step function records for this lot_id
    docs = list(collection.find({
        "lot_id": lot_id,
        "seller_email": "bid@aspenartmuseum.org",
        "auction_id": "A0001"
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
            status = details['status']
            
            if status == "RUNNING":
                input_data = json.loads(details.get("input", "{}"))
                
                start_date_sf = input_data.get("start_date")
                end_date_sf = input_data.get("end_date")
                
                # Convert dates
                if isinstance(start_date_sf, str):
                    try:
                        start_date_sf = datetime.fromisoformat(start_date_sf.replace('Z', '+00:00'))
                    except:
                        start_date_sf = None
                elif isinstance(start_date_sf, (int, float)):
                    if start_date_sf > 1e10:
                        start_date_sf = datetime.fromtimestamp(start_date_sf / 1000)
                    else:
                        start_date_sf = datetime.fromtimestamp(start_date_sf)
                
                if isinstance(end_date_sf, (int, float)):
                    if end_date_sf > 1e10:
                        end_date_sf = datetime.fromtimestamp(end_date_sf / 1000)
                    else:
                        end_date_sf = datetime.fromtimestamp(end_date_sf)
                elif isinstance(end_date_sf, str):
                    try:
                        end_date_sf = datetime.fromisoformat(end_date_sf.replace('Z', '+00:00'))
                    except:
                        end_date_sf = None
                
                running_arns.append((arn, created_at_str, start_date_sf, end_date_sf))
                
        except Exception as e:
            print(f"  ⚠️ Failed to describe ARN: {e}")

    # Summary for this lot
    if running_arns:
        # Latest execution
        latest_arn = running_arns[0]
        print(f"\n🔵 LATEST EXECUTION:")
        print(f"  Created: {latest_arn[1]}")
        print(f"  Start: {latest_arn[2]}")
        print(f"  End: {latest_arn[3]}")
        print(f"  ARN: {latest_arn[0]}")

        # Duplicates
        if len(running_arns) > 1:
            print(f"\n⚠️ DUPLICATES:")
            for arn, created_at_str, start_sf, end_sf in running_arns[1:]:
                print(f"  Created: {created_at_str}")
                print(f"  Start: {start_sf}")
                print(f"  End: {end_sf}")
                print(f"  ARN: {arn}")
    else:
        print(f"\n⚪ No running executions")
    
    print(f"\n{'='*80}")
