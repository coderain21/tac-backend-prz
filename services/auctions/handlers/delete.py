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
import boto3

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
auctions_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
collection_seller = db[os.environ["SELLERS_TABLE"]]
lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]
# access_logs_collection= db[os.environ["ACCESS_LOGS_TABLE"]]

# MongoDB and collection setup


# Image deletion functions moved to cleanup.py for async processing


# Cleanup functions moved to cleanup.py for async processing


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
        # Authorization check
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
        print(f"Processing deletion for auction_id: {auction_id}, seller_email: {seller_email}")

        # Check if the auction with the given ID exists
        auction = auctions_collection.find_one(
            {'auction_id': auction_id, 'seller_email': seller_email}, {'_id': 0})

        if not auction:
            return {
                "headers": headers,
                'statusCode': 404,
                'body': json.dumps({"message": "Auction with associated auction_id doesn't exists"})
            }

        # Check if the status allows deletion
        current_status = auction.get('status')
        if current_status not in ['Draft', 'Published', 'Deleted']:
            return {
                "headers": headers,
                'statusCode': 400,
                'body': json.dumps({"message": 'You cannot delete the auction with the current status'})
            }

        print(f"Auction found with status: {current_status}. Proceeding with deletion...")

        # Update the status to "Deleted" first
        update_result = auctions_collection.update_one(
            {'auction_id': auction_id, 'seller_email': seller_email},
            {'$set': {'status': 'Deleted'}}
        )

        if update_result.modified_count == 1:
            print("Auction status updated to 'Deleted' successfully")
            
            # Trigger async cleanup Lambda
            try:
                lambda_client = boto3.client('lambda')
                cleanup_payload = {
                    'auction_id': auction_id,
                    'seller_email': seller_email,
                    'auction_image': auction.get('auction_image')
                }
                
                lambda_client.invoke(
                    FunctionName=os.environ.get('CLEANUP_LAMBDA_NAME', 'auction-cleanup-lambda'),
                    InvocationType='Event',  # Async invocation
                    Payload=json.dumps(cleanup_payload)
                )
                print(f"Triggered async cleanup for auction {auction_id}")
            except Exception as e:
                print(f"Failed to trigger cleanup Lambda: {str(e)}")
        else:
            print("Warning: Auction status update failed")
            return {
                "headers": headers,
                'statusCode': 500,
                'body': json.dumps({"message": "Failed to update auction status"})
            }

        # Access logs (commented as in original)
        seller_data = collection_seller.find_one({"email_address": seller_email}, {"_id": 0})
        # Get the current timestamp in seconds and convert to milliseconds
        # timestamp_ms = int(datetime.now().timestamp() * 1000)

        # Convert to float and format as a string with '.0'
        # formatted_timestamp = float(timestamp_ms)

        # access_logs = {
        #     "actor_id": seller_data.get('seller_id'),
        #     "updated_by": {
        #         "type": 'Seller',
        #         "name": seller_data.get('first_name') + ' ' + seller_data.get('last_name'),
        #         "email_address": seller_email,
        #     },
        #     "section": {
        #         "name": 'Auction Management',
        #         "action": 'Delete',
        #         "auction_id": auction_id,
        #     },
        #     "updated_at": formatted_timestamp
        # }
        # access_logs_collection.insert_one(access_logs)

        print(f"Auction deletion initiated successfully for auction_id: {auction_id}")
        return {
            "headers": headers,
            'statusCode': 204,
            'body': json.dumps({})
        }

    except Exception as err:
        print(f"Critical error in delete_auction: {str(err)}")
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"message": "There was an error while deleting the auction"})
        }