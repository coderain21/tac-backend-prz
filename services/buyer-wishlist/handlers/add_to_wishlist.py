"""
Module: add_to_wishlist

This module provides functionality to add lots to a buyer's wishlist.
"""
import json
import os
from pymongo import MongoClient
from bson import ObjectId

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


class MongoEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o)
        return super().default(o)

client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]
buyer_collection = db[os.environ['BUYER_COLLECTION']]
wish_list = db[os.environ['BUYER_WISHLIST_TABLE_NAME']]


def create(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
            print('email', email_address)
        except:
            print('here in second')
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        body = json.loads(event['body'])
        data = event['queryStringParameters']

        lot = data['lot_id']
        if not lot:
            return{
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Please provide a lot id'})
            }
        lot_id = ObjectId(lot)
        lot_detail = lot_collection.find_one({'_id': lot_id})
        seller_email = lot_detail['seller_email']
        auction_name = body['auction_name']
        auction_uid = data['auction_uid']

        buyer_id = ObjectId(data['buyer_id'])
        insert_data = {
            'seller_email': seller_email,
            'lot_id': lot_id,
            'buyer_id': buyer_id,
            'email_address': email_address,
            'auction_name': auction_name,
            'auction_id': lot_detail['auction_id'],
            'auction_uid': ObjectId(auction_uid)
        }
        existing_wishlist_entry = wish_list.find_one(insert_data)
        if existing_wishlist_entry:
            return{
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Lot already exist in wishlist'})
            }
        wish_list.insert_one(insert_data)
        # client.close()
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"message": "Lot added to wishlist successfully"})
        }

    except Exception as e:
        print(str(e))
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": "Internal server error"})
        }