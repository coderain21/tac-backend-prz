"""This module is used to update the seller status"""

import datetime
import json
import os
from bson import ObjectId

from pymongo import MongoClient


headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

"""
    The `update_seller_status` function will update the status of the seller
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
def update_seller_status(event, context): 
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
        except:
            return {
                    "statusCode": 403,
                    "headers": headers,
                    "body": json.dumps({"message": "You do not have access to perform this API action"})
                }
        
        #  Connecting to MongoDB using PyMongo
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        seller_collection = db[os.environ["SELLERS_TABLE"]]

        # Extracting params from the request
        query_params = event.get("queryStringParameters")
        seller_id = query_params.get("seller_id", None)
        seller_status = query_params.get("status", None)
  
        if seller_id is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Invalid request, Seller ID is not provided"})
            }
        
        # Searching seller existance by id
        seller_detail = seller_collection.find_one({"_id", ObjectId(seller_id)}, { "_id": 1 })
        if seller_detail is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message":"Seller does not exist."}),
            }
        
        # updating the seller status
        query = {"_id", ObjectId(seller_id)}
        new_values = {"$set":{"status": seller_status, "updated_at": datetime.datetime.utcnow()}}
        try:
            seller_collection.update_one(query, new_values)

            return {
                "statusCode":200,       
                "headers": headers,    
                "body":json.dumps( {"message":"Seller status updated successfully"})
            }
        except:
            return {
                "statusCode": 500,
                "headers": headers,
                "body": json.dumps({"Update failed, there was an error during update"})
            }
    except:
        return {
            "statusCode": 500,
            "headers": headers,
             "body": json.dumps({"message": "There was an error "})
        }