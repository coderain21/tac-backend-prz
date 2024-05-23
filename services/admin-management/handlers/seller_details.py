"""This module is used to get the particular seller detail"""
import json
import os

from bson import ObjectId
from lib.common_helper import Encoder
from pymongo import MongoClient

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

"""
    The `seller_details` function retrieves a details of a particular seller
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
def seller_details(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
        except:
            return {
                    "statusCode": 403,
                    "headers": headers,
                    "body": json.dumps({"message": "You do not have access to perform this API action"})
                }

        # Connecting to mongo db
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        seller_collection = db[os.environ["SELLERS_TABLE"]]

        # Extracting params from the request
        query_parameters = event.get('queryStringParameters')
        seller_id = query_parameters.get('seller_id',None)
        print(type(seller_id))
        if seller_id is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Invalid request, Seller ID is not provided"})
            }
        # Fetching seller details
        seller_id = ObjectId(seller_id)
        out_fields = {
            "_id": 1,
            "full_name": 1,
            "first_name": 1,
            "last_name": 1,
            "email_address":1,
            "phone_number": 1,
            "status": 1,
            "date_of_birth": 1,
            "brand_name": 1,
            "business_registration_number":1,
            "website":1,
            "created_at":1,
            "kyc_status": 1,
            "kyb_status": 1,
            "plan_type": 1,
            "address_line_1": 1,
            "address_line_2": 1,
            "city": 1,
            "postal_code": 1,
            "country": 1,
            "country_code":1,
            "about":1
        }
        seller_details = seller_collection.find_one({"_id": seller_id}, out_fields)
        if seller_details is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message":"Seller is not found"})
            }
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(seller_details, cls=Encoder)
        }
    except:
        return {
            "statusCode": 500,
            "headers": headers,
             "body": json.dumps({"message": "There was an error "})
        }