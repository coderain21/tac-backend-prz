"""This module is used to view the details of an auction"""
import json
import os
import re
from pymongo import MongoClient
from lib.common_helper import Encoder

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}



client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]



def prepend_backslash(text):
    # Define a regular expression pattern to match special characters
    special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')

    # Use re.sub to replace each match with a backslash followed by the matched character
    modified_text = re.sub(special_chars_pattern, r'\\\1', text)

    return modified_text

def total_lots(event, context):
    try:
        seller_email = event['queryStringParameters']['seller_email']
        result= lot_collection.count_documents({"seller_email":seller_email})
        if result is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Auction not found"})
            }
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"total_lots":result}, cls=Encoder) 
        }
    except Exception as err:
        print("Error",str(err))
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "Internal Server Error"})
        }
