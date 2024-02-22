"""This module is used to view the details of an auction"""
import json
import os
import re
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



client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]



def prepend_backslash(text):
    # Define a regular expression pattern to match special characters
    special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')

    # Use re.sub to replace each match with a backslash followed by the matched character
    modified_text = re.sub(special_chars_pattern, r'\\\1', text)

    return modified_text

def auction_details(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
            print('email', email_address)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        print(11231)
        auction_id = event['queryStringParameters']['auction_id']
        print(1)
        result= auction_collection.find_one({"_id":ObjectId(auction_id)})
        if result is None:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(result, cls=Encoder)
        }
      
    except Exception as err:
        print("Error",str(err))
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "Internal Server Error"})
        }
