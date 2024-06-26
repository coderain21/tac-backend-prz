"""
Module: deactivate

This module contains a Lambda function for deactivating an auction. It connects to a MongoDB database
and allows sellers to deactivate auctions they own, changing their status to "Draft". The function
verifies the seller's authorization and checks the auction's status before Deactivation.

Dependencies:
- pymongo: Python driver for MongoDB.

"""
import os
import json
from pymongo import MongoClient

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]

# def notify_bidders(data):
#     """
#     Function used to notify the bidders that the auction has been canceled.
#     """
#     pass

def deactivate(event, context):
    """
    deactivate an auction with the specified ID, provided the seller has the necessary authorization
    and the auction's status allows deactivation.

    Args:
        event (dict): The input event data containing request parameters and context.
        context (object): Lambda function execution context.

    Returns:
        dict: A dictionary containing the API response including status code and body.
    """
    try:
        try:
            seller_email = event['requestContext']['authorizer']['claims']['email']
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        data = json.loads(event["body"])
        # Get the auction_id from the path parameter
        auction_id = data.get("auction_id")
        if auction_id is None:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }
        # Set up the MongoDB connection
        auctions_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]

        # Check if the auction with the given ID exists
        auction = auctions_collection.find_one(
            {'auction_id': auction_id, 'seller_email': seller_email}, {'_id': 0})
        print(seller_email)
        if auction:
            # print(auction)
            # Check if the status is "Draft" or "Published"
            current_status = auction.get('status')
            if current_status in ['Draft', "Accepting bids"]:
                # Update the status to "Deleted"
                auctions_collection.update_one(
                    {'auction_id': auction_id, 'seller_email': seller_email},
                    {'$set': {'status': 'Draft'}}
                )
                return {
                    "headers": headers,
                    'statusCode': 204,
                    'body': json.dumps({
                    })
                }
            else:
                return {
                    "headers": headers,
                    'statusCode': 400,
                    'body': json.dumps({"message": 'You cannot deactivate the auction with the current status'})
                }
        else:
            return {
                "headers": headers,
                'statusCode': 404,
                'body': json.dumps({"message": "Auction with associated auction_id doesn't exists"})
            }
    except Exception as err:
        print(err)
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"message": "There was an error while deactivating the auction"})
        }
