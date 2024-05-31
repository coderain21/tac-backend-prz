"""
Module: delete

This module contains a Lambda function for deleting an auction. It connects to a MongoDB database
and allows sellers to delete auctions they own, changing their status to "Deleted". The function
verifies the seller's authorization and checks the auction's status before deletion.

Dependencies:
- pymongo: Python driver for MongoDB.
- lib.get.get_by_email: A function for retrieving seller information by email address.

Environment Variables:
- SELLERS_TABLE: The name of the table containing seller information.
- MONGO_CLIENT: The MongoDB client connection string.
- DATABASE: The name of the MongoDB database.
- AUCTION_MONGODB_COLLECTION_NAME: The name of the MongoDB collection for auctions.

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


def delete_auction(event, context):
    """
    Delete an auction with the specified ID, provided the seller has the necessary authorization
    and the auction's status allows deletion.

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
        # Get the auction_id from the path parameter
        auction_id = event['pathParameters']['auction_id']

        # Set up the MongoDB connection
        auctions_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]

        # Check if the auction with the given ID exists
        auction = auctions_collection.find_one(
            {'auction_id': auction_id, 'seller_email': seller_email}, {'_id': 0})

        if auction:
            # print(auction)
            # Check if the status is "Draft" or "Published"
            current_status = auction.get('status')
            if current_status in ['Draft', 'Published', 'Deleted']:
                # Update the status to "Deleted"
                auctions_collection.update_one(
                    {'auction_id': auction_id, 'seller_email': seller_email},
                    {'$set': {'status': 'Deleted'}}
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
                    'body': json.dumps({"message": 'You cannot delete the auction with the current status'})
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
            "body": json.dumps({"message": "There was an error while deleting the auction"})
        }
