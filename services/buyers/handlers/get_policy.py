'''this api will retrieve the privacy policy of a seller'''
import json
import os
from pymongo import MongoClient
from bson import ObjectId
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
auction_collection= db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]


def get_policy(event, context):
    """
    Takes the seller email from the path parameter
    fetches the seller data from the db
    only fetched the privacy policy by using projection
    returns the fetched privacy policy of the seller
    """
    try:
        data = event['pathParameters']
        auction_id = urllib.parse.unquote(event['pathParameters']['auction_id'])
        if not auction_id:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide seller email"})
            }

        auction_info = auction_collection.find_one({"_id": ObjectId(auction_id)})
        seller_email = auction_info.get('seller_email')
        # Fetch required fields: privacy_policy, created_at, first_name, last_name
        seller_info = seller_collection.find_one(
            {'email_address': seller_email},
            {"privacy_policy": 1, "created_at": 1, "first_name": 1, "last_name": 1, "marketing_opt_in": 1, "brand_name": 1, "_id": 0}
        )


        if seller_info is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Seller not found"})
            }

        # Check if privacy_policy exists and is not empty
        if seller_info.get('privacy_policy'):
            # Return only the privacy policy if it exists and is not empty
            response_data = {'privacy_policy': seller_info['privacy_policy']}
        else:
            # Return created_at, first_name, and last_name if privacy_policy is empty or missing
            response_data = {
                'created_at': seller_info.get('created_at'),
                'first_name': seller_info.get('first_name'),
                'last_name': seller_info.get('last_name'),
                'brand_name': seller_info.get('brand_name')
            }
        # Check if marketing_opt_in exists in seller_info before accessing it
        response_data.update({'marketing_opt_in': seller_info.get('marketing_opt_in', '')})
        response_data.update({'seller_email': seller_email})
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data': response_data}, cls=Encoder)
            }
    except Exception as e:
        print("Internal Server Error", str(e))
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "internal server error"})
            }
