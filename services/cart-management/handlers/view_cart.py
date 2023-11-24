import json
import os
from pymongo import MongoClient
from lib.common_helper import Encoder
from bson import ObjectId


headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def view(event, context):
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
        
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ['CART_COLLECTION']]
        data = event['queryStringParameters']
        auction_id = data['auction_id']
        auction_id= ObjectId(auction_id)
        cart_details= collection.find({'email_address':email_address,'auction_id':auction_id})
        if cart_details is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "No Lots found"})
            }
        return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps({"data":list(cart_details)},cls = Encoder)
            }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
        }