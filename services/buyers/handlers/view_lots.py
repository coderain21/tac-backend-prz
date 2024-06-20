
"""This module is used for view lots"""
import json
import os
from pymongo import MongoClient
from bson import ObjectId
from lib.common_helper import Encoder

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
collection = db[os.environ["LOT_COLLECTION_NAME"]]
# buyer_collection = db[os.environ['BUYER_COLLECTION']]
wishlist_collection = db[os.environ["BUYER_WISHLIST_TABLE_NAME"]]
auction = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]



def lot_details(event, context):
    try:
        # Parse query parameters from the event
        data = event['queryStringParameters']
        if data is None or "lot_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide lot_id"})
            }
        lot_id = ObjectId(data['lot_id'])
        buyer_id = data.get('buyer_id')  # Check if buyer_email is provided
        # client = MongoClient(
                    #   os.environ['MONGO_CLIENT'],
                    #   maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                    #     )
        # db = client[os.environ['DATABASE']]
        # collection = db[os.environ["LOT_COLLECTION_NAME"]]
        # # buyer_collection = db[os.environ['BUYER_COLLECTION']]
        # wishlist_collection = db[os.environ["BUYER_WISHLIST_TABLE_NAME"]]
        # auction = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        # buyer_details = buyer_collection.find_one({'_id': ObjectId(buyer_id)})
        # buyer_email = buyer_details['email_address']
        result = collection.find_one({'_id': lot_id})
        # Check if buyer_email is provided in the query parameters
        if buyer_id:
            wishlist_result = wishlist_collection.find_one({'lot_id': lot_id, 'seller_email': result['seller_email'], 'buyer_id': ObjectId(buyer_id)})
            result['is_wishlisted'] = wishlist_result is not None
        else:
            result['is_wishlisted'] = False

        auction_details = auction.find_one({'auction_id': result['auction_id'], 'seller_email': result['seller_email']},
                                          {'faq': 1, 'terms_and_condition': 1, 'menu_links': 1, 'font': 1})
        result['faq'] = auction_details['faq']
        result['font'] = auction_details['font']
        result['terms_and_condition'] = auction_details['terms_and_condition']
        result['menu_links'] = auction_details['menu_links']

        # client.close()

        if result is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Lot not found"})
            }

        return {
            'headers': headers,
            "statusCode": 200,
            "body": json.dumps({'data': result}, cls=Encoder)
        }

    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }
