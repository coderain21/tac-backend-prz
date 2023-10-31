'''this api will list the detail of the lot id passed in the parameter'''
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

def paddle_number(event, context):
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
        try:
            print(event)
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
        # Parse query parameters from the event
        data = event['queryStringParameters']
        if data is None or "auction_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }
        auction_id= data['auction_id']
        auction_id= ObjectId(auction_id)
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        buyer = db[os.environ["REGISTER_AUCTION_COLLECTION"]]
        auction=db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        auction_details= auction.find_one({'_id':auction_id})
        paddle=buyer.find_one({"seller_email":auction_details['seller_email'],
                               'email_address':email_address,'auction_id':auction_id})
        if paddle is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "paddle not found"})
            }
        try:
            result=paddle['paddle']
        except Exception:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "paddle not found"})
            }
            
        client.close()
        if result is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "data not found"})
            }
        return {
            'headers': headers,
            "statusCode": 200,
            "body": json.dumps({'data':{'paddle':result}})
        }
    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }