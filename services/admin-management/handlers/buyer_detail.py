"""This module is used to list the auctions """
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


client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
buyer_collection = db[os.environ["BUYER_COLLECTION"]]
user_collection = db[os.environ["SELLERS_TABLE"]]


def prepend_backslash(text):
    # Define a regular expression pattern to match special characters
    special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')

    # Use re.sub to replace each match with a backslash followed by the matched character
    modified_text = re.sub(special_chars_pattern, r'\\\1', text)

    return modified_text

def buyer_detail(event, context):
    """
    The `list_auction` function retrieves a list of auctions based on specified filters and pagination
    parameters.
    :param event: The `event` parameter is a dictionary that contains the input data for the function.
    It includes the query string parameters that are passed to the function. These parameters are used
    to filter and paginate the auction list
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes properties such as the AWS request ID, the function name,
    the function version, and more. This parameter is not used in the code you provided, but it is
    commonly included in AWS Lambda functions
    :return: a dictionary with the following keys:
    - "statusCode": an integer representing the HTTP status code
    - "headers": a dictionary representing the HTTP headers
    - "body": a JSON string representing the response body
    """
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
        # client = MongoClient(
        #               os.environ['MONGO_CLIENT'],
        #               maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
        #                 )
        # db = client[os.environ['DATABASE']]
        # buyer_collection = db[os.environ["BUYER_COLLECTION"]]
        # user_collection = db[os.environ["SELLERS_TABLE"]]
        print(1)
        # result= user_collection.find_one({"user_type":"admin","email_address":email_address})
        # if result is None:
        #     return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }
        query_parameters = event.get('queryStringParameters')
        buyer_id = query_parameters.get('buyer_id',None)
        if buyer_id is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Buyer id not found"})
            }

        buyer_id= ObjectId(buyer_id)
        projection= {
            "_id":1,
            "first_name":1,
            "last_name":1,
            "email_address":1,
            "phone_number": 1,
            "country_code":1,
            "address_line1": 1,
            "address_line2": 1,
            "country": 1,
            "is_manual": 1,
            "postal_code": 1,
            "town/city": 1,
            "seller_email":1
        }
        buyer_detail= buyer_collection.find_one({"_id":buyer_id},projection)
        if buyer_detail is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "buyer not found"})
            }
        return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps(buyer_detail,cls=Encoder)
            }
    except Exception as err:
        print('Error',str(err))
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
        }
