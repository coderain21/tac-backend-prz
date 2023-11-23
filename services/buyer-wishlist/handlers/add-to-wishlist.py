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


class MongoEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o)
        return super().default(o)

def create(event, context):
    try:
        try:
            cognito_data = json.loads(event['requestContext']['authorizer']['data'])
            email_address = cognito_data['email']
            if "cognito:groups" in cognito_data and not 'buyer' in cognito_data["cognito:groups"]:
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

        body = json.loads(event['body'])
        data = event['queryStringParameters']
        lot = data['lot_id']
        lot_id = ObjectId(lot)
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]
        buyer_collection = db[os.environ['BUYER_COLLECTION']]
        wish_list = db[os.environ['BUYER_WISHLIST_TABLE_NAME']]
        lot_detail = lot_collection.find_one({'_id': lot_id})
        seller_email = lot_detail['seller_email']
        auction_name = body['auction_name']
        insert_data = {
            'seller_email': seller_email,
            'lot_id': lot_id,
            'email_address': email_address,
            'auction_name': auction_name,
            'auction_id': lot_detail['auction_id']
        }

        wish_list.insert_one(insert_data)

        # Find lots with the same seller email and check if they are present in the wishlist
        similar_lots = lot_collection.aggregate([
            {"$match": {"seller_email": seller_email}},
            {"$lookup": {
                "from": os.environ['BUYER_WISHLIST_TABLE_NAME'],
                "localField": "_id",
                "foreignField": "lot_id",
                "as": "wishlist"
            }},
            {"$addFields": {
                "is_wishlisted": {
                    "$cond": {
                        "if": {
                            "$in": ["$_id", "$wishlist.lot_id"]
                        },
                        "then": True,
                        "else": False
                    }
                }
            }},
            {"$project": {"wishlist": 0}}  # Remove the wishlist field from the result
        ])


        

        # Convert the aggregation result to a list for JSON serialization
        similar_lots = list(similar_lots)
        print("Aggregation Result:", similar_lots)
        client.close()
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"message": "Lot added to wishlist successfully", "similar_lots": similar_lots}, cls=MongoEncoder)
        }

    except Exception as e:
        print(str(e))
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": "Internal server error"})
        }