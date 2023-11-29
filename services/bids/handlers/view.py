import json
import os
from bson import ObjectId
from pymongo import MongoClient
from lib.common_helper import Encoder

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def view_bidder(event, context):
    """
    The `view_bidder` function retrieves detailed information about a single bidder based on the provided bidder ID.

    :param event: The `event` parameter is a dictionary that contains the input data for the function.
    :param context: The `context` parameter is an object that provides information about the runtime environment of the function.

    :return: a JSON response with the following properties:
    - "statusCode": The HTTP status code of the response (200 for success, 403 for access denied, 404 for not found, 500 for error)
    - "body": A JSON string containing the response data, including the bidder details.
    """
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
            print('email', email_address)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        # Extract bidder ID from the path parameter
        bidder_id = ObjectId(event['pathParameters']['id'])

        # Retrieve bidder details from the database
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["REGISTER_AUCTION_COLLECTION"]]
        buyer_collection = db[os.environ['BUYER_COLLECTION']]

        # Define the projection to include/exclude fields as needed
        bidder_details = collection.find_one({"_id": bidder_id})
        bidder_email = bidder_details['email_address']
        seller_email = email_address
        buyer_bidder_details = buyer_collection.find_one({'email_address': bidder_email, 'seller_email': seller_email})

        if buyer_bidder_details:
            client.close()
            # Bidder found, return details
            return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps(buyer_bidder_details, cls=Encoder)
            }
        else:
            # Bidder not found
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Bidder not found"})
            }
    except Exception as err:
        print(err)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "Error while retrieving bidder details"})
        }
        
