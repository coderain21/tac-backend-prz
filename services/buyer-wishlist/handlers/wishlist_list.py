"""
Module: wishlist_listing

This module provides functionality to list lots from a buyer's wishlist.
"""
import json
import os
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime

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
        if isinstance(o, datetime):
            # Convert to ISO string in UTC (consistent across clients)
            return o.astimezone().isoformat()
        return super().default(o)


# client = MongoClient(
                    #   os.environ['MONGO_CLIENT'],
                    #   maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                    #     )
client = MongoClient(
    os.environ['MONGO_CLIENT'],
    maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
)
db = client[os.environ['DATABASE']]
wishlist_collection = db[os.environ['BUYER_WISHLIST_TABLE_NAME']]
lot_collection = db[os.environ['LOTS_TABLE_NAME']]
auction_collection = db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]

def wishlist_list(event, context):
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

        data = event['queryStringParameters']

        seller_email = str(data.get('seller_email'))
        print('seller email', seller_email)
        if not seller_email:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Please provide a valid seller_email'})
            }

        auction_id = data.get('auction_id')
        if not auction_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Please provide a valid auction_uid'})
            }

        pipeline = [
            {"$match": {"email_address": email_address}},
            {"$lookup": {
                "from": os.environ['LOTS_TABLE_NAME'],
                "localField": "lot_id",
                "foreignField": "_id",
                "as": "lot_details"
            }},
            {"$unwind": "$lot_details"},
            {"$match": {"lot_details.seller_email": seller_email}},
            {"$lookup": {
                "from": os.environ['AUCTION_MONGODB_COLLECTION_NAME'],
                "localField": "auction_uid",
                "foreignField": "_id",
                "as": "auction_details"
            }},
            {"$unwind": "$auction_details"},
            # {"$match": {"auction_details.seller_email": seller_email}},
            {"$project": {
                "_id": 0,
                "lot_details": 1,
                "auction_name": "$auction_details.title",
                "auction_id": "$auction_details.auction_id",
                "auction_type": "$auction_details.auction_type",
                "currency": "$auction_details.currency",
                "time_zone": "$auction_details.time_zone",
                "auction_uid": "$auction_details._id",
                "registration_type": "$auction_details.registration_type"
            }}
        ]



        print('pipeline', pipeline)


        # Execute the aggregation pipeline
        wishlist_with_lot_details = list(wishlist_collection.aggregate(pipeline))

        # if not wishlist_with_lot_details:
        #     return {
        #         'statusCode': 404,
        #         'headers': headers,
        #         'body': json.dumps({'message': 'Wishlist not found'})
        #     }

        response_body = json.dumps({"data": wishlist_with_lot_details}, cls=MongoEncoder)
        return {
            "statusCode": 200,
            "headers": headers,
            "body": response_body
        }
    except Exception as e:
        print(e)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "Internal server error"})
        }