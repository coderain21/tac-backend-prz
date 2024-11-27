'''this api will list all the lots'''
import json
import os
from pymongo import MongoClient
from bson import ObjectId
from lib.common_helper import Encoder


# Constants
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


# Create MongoClient instance globally
client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]
buyer_collection = db[os.environ["BUYER_COLLECTION"]]
auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
# wishlist_collection = db[os.environ['BUYER_WISHLIST_TABLE_NAME']]


# Lambda function
def handler(event, context):
    try:
        data = event.get('queryStringParameters', {})
        print('data', data)
        auction_id = data.get("auction_id")


        if not auction_id:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }

        _id = ObjectId(auction_id)
        projection = {"_id": 1, "auction_id": 1, "seller_email": 1}
        result = auction_collection.find_one({"_id": _id}, projection)
        auction_uuid = result['auction_id']
        seller_email = result['seller_email']

        lot_projection = {
            "_id": 1, 
            "lot_number": 1, 
            "title1":1, 
            "current_bid": 1,
            "start_time": 1,
            "high_estimate": 1,
            "low_estimate": 1,
            "images": 1
            }

        lots = list(lot_collection.find({"auction_id": auction_uuid, "seller_email": seller_email}, projection=lot_projection))

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data': lots}, cls=Encoder)
        }
    except Exception as e:
        print(str(e))
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": str(e)})
        }