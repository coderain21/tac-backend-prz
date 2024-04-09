"""This module contains AWS Lambda functions for creating user pools and handling requests related to subdomains, DynamoDB, AWS KMS, and MongoDB.

Module Functions:
- encrypt_data(data): Encrypt data using AWS Key Management Service (KMS).
- create_user_pool(sub_domain_name): Create a Cognito User Pool with a specified subdomain.
- fetch_item_from_dynamodb(sub_domain_name): Fetch an item from DynamoDB based on a subdomain name.
- create(event, context): Handle a create event for a subdomain, fetch relevant data, encrypt it, and return the encrypted data as a response.

The code provides functionality to create user pools in Amazon Cognito, fetch data from DynamoDB based on subdomains, and encrypt the data using AWS KMS. It also handles errors and returns appropriate responses.

Note that this code assumes specific environment variables are set for configuration, such as 'REGION', 'KMS_KEY_ID', 'SUB_DOMAIN_TABLE', 'MONGO_CLIENT', 'DATABASE', 'USERPOOLS_MONGO', and others as required.
"""
from pymongo import MongoClient
import json
import os
from bson import ObjectId
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def fetch_seller_email_from_auction(auction_id):
    """
    Fetch the seller's email from the auction collection in MongoDB.

    Args:
        auction_id (str): The unique identifier of the auction.

    Returns:
        str: The seller's email associated with the given auction_id or None if not found.
    """
    auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
    email = auction_collection.find_one(
            {"_id":ObjectId(auction_id)},{'seller_email' : 1}).get('seller_email')
    return email

def create(event, context):
    """Handle a create event for a subdomain, fetch relevant data, encrypt it, and return the encrypted data as a response.

    Args:
        event (dict): The event data containing information about the subdomain in the 'pathParameters'.
        context: The AWS Lambda context object (not used in this function).

    Returns:
        dict: A response containing the encrypted data as a base64-encoded string or an error response in case of issues.
    """
    try:
        # sub_domain_name = event['queryStringParameters'].get('domain')
        auction_id = event['queryStringParameters'].get('auction_id')
        # default = sub_domain_name == os.environ["DEFAULT_SUB_DOMAIN"]
        data = fetch_seller_email_from_auction(auction_id)

        return {
            "statusCode": 201,
            "headers": headers,
            "body": json.dumps({"seller_email": data})
        }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error"})
        }
