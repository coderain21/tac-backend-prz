'''This module handles deletion of bids from the system'''
import os
import json
import pymongo
import datetime
import redis
from lib.common_helper import Encoder

# CORS headers
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

# Initialize MongoDB client
client = pymongo.MongoClient(os.environ['MONGO_CLIENT'], maxIdleTimeMS=60000)
db = client[os.environ['DATABASE']]
bid_information_collection = db[os.environ["LOT_COLLECTION_NAME"]]
unique_bids_collection = db[os.environ["UNIQUE_BIDDERS_COLLECTIONS"]]
lot_collection = db["{}".format(os.environ["STAGE"] + "-lots")]

# Initialize Redis connection
redis_client = redis.Redis.from_url(os.environ['REDIS_CLUSTER_ENDPOINT'])

def delete_bid(event, context):
    """
    Deletes a bid from the system and updates related records
    
    Args:
        event: API Gateway event containing the bid_id
        context: Lambda context
    
    Returns:
        API Gateway response with status code and message
    """
    try:
        # Extract the bid ID from the event
        bid_id = event['pathParameters']['bid_id']
        
        # Look up the bid information
        bid_info = bid_information_collection.find_one({"_id": pymongo.ObjectId(bid_id)})
        
        if not bid_info:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Bid not found"})
            }
        
        # Get the lot information
        lot_id = bid_info['lot_id']
        bid_amount = bid_info['bid_amount']
        buyer_id = bid_info['buyer_id']
        
        # Get the lot information
        lot = lot_collection.find_one({"_id": pymongo.ObjectId(lot_id)})
        
        if not lot:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Lot not found"})
            }
        
        # Check if auction is closed or locked
        if lot.get("status") in ["Closed", "Locked"]:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Cannot delete bid on a closed or locked auction"})
            }
        
        # Get all bids for this lot sorted by bid amount in descending order
        bids_query = {
            "lot_id": lot_id
        }
        
        all_bids = list(bid_information_collection.find(bids_query).sort("bid_amount", pymongo.DESCENDING))
        all_unique_bids = list(unique_bids_collection.find(bids_query).sort("bid_amount", pymongo.DESCENDING))
        
        # Only proceed if we found the bid
        if not all_bids or len(all_bids) == 0:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "No bids found for this lot"})
            }
        
        # Delete the bid from both collections
        bid_information_collection.delete_one({"_id": pymongo.ObjectId(bid_id)})
        unique_bids_collection.delete_one({"_id": pymongo.ObjectId(bid_id) if "_id" in bid_info else None})
        
        # Delete from unique_bids collection by other criteria if ID doesn't match
        if "_id" not in bid_info or not unique_bids_collection.find_one({"_id": pymongo.ObjectId(bid_id)}):
            unique_bids_collection.delete_one({
                "lot_id": lot_id,
                "buyer_id": buyer_id,
                "bid_amount": bid_amount
            })
        
        # Recalculate top bidder after deletion
        remaining_bids = list(bid_information_collection.find(bids_query).sort("bid_amount", pymongo.DESCENDING))
        remaining_unique_bids = list(unique_bids_collection.find(bids_query).sort("bid_amount", pymongo.DESCENDING))
        
        # Update lot with new top bidder info
        update_data = {}
        
        if not remaining_bids or len(remaining_bids) == 0:
            # No bids left, clear bid information
            update_data = {
                "current_bid": 0,
                "top_bidder": "",
                "paddle_number": None,
                "winning_user": "",
                "max_bid": 0
            }
        else:
            # Set the highest remaining bidder as the top bidder
            new_top_bid = remaining_bids[0]
            update_data = {
                "current_bid": new_top_bid["bid_amount"],
                "top_bidder": new_top_bid["name"],
                "paddle_number": new_top_bid["paddle_number"],
                "winning_user": new_top_bid["buyer_id"],
                "max_bid": new_top_bid.get("max_bid", new_top_bid["bid_amount"])
            }
            
            # Update the status of the new top bidder to "Winning"
            bid_information_collection.update_one(
                {"_id": new_top_bid["_id"]},
                {"$set": {"bid_status": "Winning"}}
            )
        
        # Update the lot with the new top bidder information
        lot_collection.update_one(
            {"_id": pymongo.ObjectId(lot_id)},
            {"$set": update_data}
        )
        
        # Update Redis cache for this lot
        redis_key = f"lot:{lot_id}"
        existing_record = redis_client.hget('lot', redis_key)
        
        if existing_record:
            try:
                lot_data = json.loads(existing_record)
                # Update the lot data with new top bidder info
                lot_data.update(update_data)
                # Save back to Redis
                redis_client.hset('lot', redis_key, json.dumps(lot_data))
            except Exception as e:
                print(f"Error updating Redis: {e}")
        
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({
                "message": "Bid successfully deleted",
                "deleted_bid_id": bid_id,
                "new_top_bidder": update_data.get("top_bidder", "")
            }, cls=Encoder)
        }
        
    except Exception as e:
        print(f"Error deleting bid: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": f"There was an error while deleting the bid: {str(e)}"})
        }
    finally:
        # Close MongoDB connection
        if client:
            client.close()

def handler(event, context):
    """Lambda handler function for the delete_bid API endpoint"""
    return delete_bid(event, context)
