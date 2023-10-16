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

def lot_search(event, context):
    try:
        data = event['queryStringParameters']
        if data is None or "auction_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]
        auction_id = data.get("auction_id")
        search_keyword = data.get('search')
        print(auction_id, search_keyword)
        if auction_id is not None:
            _id = ObjectId(auction_id)
        print(type(_id))
        projection = {
            "_id": 0,
            "auction_id": 1,
            "seller_email": 1
        }
        result = collection.find_one({"_id": _id}, projection)
        print(result)
        auction_id = result['auction_id']
        seller_email = result['seller_email']
        search_criteria = {
            "$or": [
                {"title1": {"$regex": f".*{search_keyword}.*", "$options": "i"}},
                {"tags": {"$elemMatch": {"$regex": f".*{search_keyword}.*", "$options": "i"}}}
            ]
        }
        search_result = lot_collection.find({"auction_id": auction_id, 'seller_email': seller_email, **search_criteria}, {'_id': 0})
        list_lots = list(search_result)
        if not list_lots:
            return {
                "statusCode": 204,
                "headers": headers,
                "body": json.dumps({"message": "No lots found"})
            }
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data': list_lots})
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": str(e)})
        }
