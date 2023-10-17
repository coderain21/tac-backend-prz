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

def view_profile(event, context):
    try:
        try:
            cognito_data = json.loads(event['requestContext']['authorizer']['data'])
            print(cognito_data['username'])
            email_address = cognito_data['username']
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
        collection = db[os.environ["BUYER_COLLECTION"]]
        result= collection.find_one({'email_address':email_address})
        client.close()
        if result is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "user not found"})
            }
        return{
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data':result})

        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": e})
        }