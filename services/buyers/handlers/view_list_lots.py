"""This module is used to view the lots with auction id"""
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


def view_list_lots(event, context):
    """
    The function `view_list_lots` retrieves a list of lots from a MongoDB database based on the provided
    auction ID and seller email, and allows sorting the lots by different parameters.

    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. In this case, it is expected to have a key called 'queryStringParameters'
    which contains the query parameters passed to the function
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other metadata. In this code, the `context` parameter is not used
    :return: a JSON response with a status code, headers, and a body. The body contains either a list of
    lots or an error message.
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
        auction_id = data.get("auction_id")
        if auction_id is not None:
            _id = ObjectId(auction_id)
        projection = {
            "_id": 1,
            "auction_id": 1,
            "seller_email": 1
        }
        result = collection.find_one({"_id": _id}, projection)
        print(result)
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]
        seller_email = result['seller_email']
        auction_id = result['auction_id']
        search_keyword = data.get('search')
        search_criteria={}
        if search_keyword:
            search_criteria = {
                "$or": [
                    {"title1": {"$regex": f".*{search_keyword}.*", "$options": "i"}},
                    {"tags": {"$elemMatch": {"$regex": f".*{search_keyword}.*", "$options": "i"}}}
                ]
            }
        search_result = lot_collection.find({"auction_id": auction_id,
                                             'seller_email': seller_email,
                                               **search_criteria}).sort('lot_number',1)
        sort_param = data.get("sort_by", "")
        if sort_param == "highest_price":
            search_result = lot_collection.find({"auction_id": auction_id,
                                            'seller_email': seller_email, **search_criteria}
                                            ).sort("starting_price", -1)
        elif sort_param == "lowest_price":
            search_result = lot_collection.find({"auction_id": auction_id,
                                             'seller_email': seller_email, **search_criteria}
                                               ).sort("starting_price", 1)
        elif sort_param == "highest_bid":
            search_result = lot_collection.find({"auction_id": auction_id,
                                             'seller_email': seller_email, **search_criteria}
                                               ).sort("current_bid", -1)
        elif sort_param == "lowest_bid":
            search_result = lot_collection.find({"auction_id": auction_id,
                                            'seller_email': seller_email, **search_criteria}
                                            ).sort("current_bid", 1)
        else:
            search_result = lot_collection.find({"auction_id": auction_id,
                                                  'seller_email': seller_email, **search_criteria}
                                                    ).sort('lot_number',1)
        lots_list = list(search_result)
        print(144,lots_list)
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data': lots_list}, cls=Encoder)
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": e})
        }
