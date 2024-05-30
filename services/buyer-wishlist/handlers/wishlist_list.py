"""
Module: wishlist_listing

This module provides functionality to list lots from a buyer's wishlist.
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


client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
wishlist_collection = db[os.environ['BUYER_WISHLIST_TABLE_NAME']]
lot_collection = db[os.environ['LOTS_TABLE_NAME']]
auction_collection = db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]

def wishlist_list(event, context):
    try:
        # try:
        #     cognito_data = json.loads(
        #         event['requestContext']['authorizer']['data'])
        #     email_address = cognito_data['email']
        #     if "cognito:groups" not in cognito_data :
        #         return {
        #             "statusCode": 403,
        #             "headers": headers,
        #             "body": json.dumps({"message": "You do not have access to perform this API action"})
        #         }
        # except:
        #     return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
            print('email', email_address)
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'buyer' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                print('here in first')
                return {
                    "statusCode": 403,
                    "headers": headers,
                    "body": json.dumps({"message": "You do not have access to perform this API action"})
                }
        except:
            print('here in second')
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        # client = MongoClient(os.environ['MONGO_CLIENT'])
        # db = client[os.environ['DATABASE']]
        # wishlist_collection = db[os.environ['BUYER_WISHLIST_TABLE_NAME']]
        # lot_collection = db[os.environ['LOTS_TABLE_NAME']]
        # auction_collection = db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]
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

        # buyer_id = data.get('buyer_id')
        # buyer_id = ObjectId(data.get('buyer_id'))
        # print('buyer id', buyer_id)

        # if not buyer_id:
        #     return {
        #         'statusCode': 400,
        #         'headers': headers,
        #         'body': json.dumps({'message': 'Please provide a valid buyer_email'})
        #     }


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
                "currency": "$auction_details.currency",
                "time_zone": "$auction_details.time_zone",
                "auction_uid": "$auction_details._id",
                "registration_type": "$auction_details.registration_type",
                "status": "$auction_details.status",
                "publish_auction_results": "$auction_details.publish_auction_results"
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