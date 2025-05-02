'''this api will retrieve the privacy policy of a seller'''
import json
import os
from pymongo import MongoClient
# from bson import ObjectId
from lib.common_helper import Encoder
import urllib.parse

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
seller_collection = db[os.environ["SELLERS_TABLE"]]


def get_policy(event, context):
    """
    Takes the seller email from the path parameter
    fetches the seller data from the db
    only fetched the privacy policy by using projection
    returns the fetched privacy policy of the seller
    """
    try:
        data = event['pathParameters']
        seller_email = urllib.parse.unquote(event['pathParameters']['seller_email'])
        if not seller_email:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide seller email"})
            }

        # auction_collection= db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]
        seller_info = seller_collection.find_one({'email_address': seller_email}, {"privacy_policy": 1, "_id": 0})

        print("seller_info", seller_info)

        if seller_info is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Seller not found"})
            }

        # Ensure privacy_policy exists, default to empty string if not
        if 'privacy_policy' not in seller_info:
            seller_info['privacy_policy'] = ''

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data': seller_info}, cls=Encoder)
            }
    except Exception as e:
        print("Internal Server Error", str(e))
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "internal server error"})
            }