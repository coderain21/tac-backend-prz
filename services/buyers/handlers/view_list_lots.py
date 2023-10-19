"""This module is used to view the lots with auction id"""
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
            "_id": 0,
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
        lots_result = result = collection.find_one(
            {"auction_id": auction_id, 'seller_email': seller_email}, {'_id': 0})
        projection = {'_id': 0}  # Exclude the _id field from the query results
        sort_param = data.get("sort_by", "")
        if sort_param == "highest_price":
            lots_result = lot_collection.find(
                {"auction_id": auction_id, 'seller_email': seller_email},
                  projection).sort("starting_price", -1)
        elif sort_param == "lowest_price":
            lots_result = lot_collection.find(
                {"auction_id": auction_id, 'seller_email': seller_email},
                  projection).sort("starting_price", 1)
        elif sort_param == "highest_bid":
            lots_result = lot_collection.find(
                {"auction_id": auction_id, 'seller_email': seller_email},
                  projection).sort("current_bid", -1)
        elif sort_param == "lowest_bid":
            lots_result = lot_collection.find(
                {"auction_id": auction_id, 'seller_email': seller_email},
                  projection).sort("current_bid", 1)
        else:
            lots_result = lot_collection.find(
                {"auction_id": auction_id, 'seller_email': seller_email},
                  projection)
        lots_list = list(lots_result)
        print(144,lots_list)
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data': lots_list})
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": e})
        }
