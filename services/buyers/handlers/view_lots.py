'''this api will list the detail of the lot id passed in the parameter'''
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

def lot_details(event, context):
    """
    The function `list_lots` retrieves details of a lot from a MongoDB database based on the provided
    lot_id.
    
    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. In this case, it is expected to have a key called `'queryStringParameters'`
    which contains the query parameters passed to the function
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other contextual information. In this code, the `context` parameter is not used, but it is included
    in the function signature for completeness
    :return: The code is returning a JSON response with a status code, headers, and a body. The specific
    response depends on the execution path of the code.
    """
    try:
        # Parse query parameters from the event
        data = event['queryStringParameters']
        if data is None or "lot_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide lot_id"})
            }
        lot_id= data['lot_id']
        lot_id= ObjectId(lot_id)
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["LOT_COLLECTION_NAME"]]
        result= collection.find_one({'_id': lot_id})
        print(result)
        client.close()
        if result is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Lot not found"})
            }
        return {
            'headers': headers,
            "statusCode": 200,
            "body": json.dumps({'data':result},cls=Encoder)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }