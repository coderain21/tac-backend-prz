'''this api is for searching in lots'''
import json
import os
from pymongo import MongoClient
from bson import ObjectId
import urllib

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def lot_search(event, context):
    """
    The `lot_search` function searches for lots in an auction based on the provided auction ID and
    search keyword.

    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. In this case, it is expected to have a key called 'queryStringParameters'
    which contains the query parameters passed to the function
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other contextual information. In this code, the `context` parameter is not used, but it is included
    in the function signature for compatibility
    :return: The function `lot_search` returns a dictionary with the following keys:
    - "statusCode": an integer representing the status code of the response
    - "headers": a dictionary representing the headers of the response
    - "body": a JSON string representing the body of the response
    """
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
        search_keyword = urllib.parse.unquote(search_keyword)
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
                "statusCode": 404,
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
