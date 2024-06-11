"""
Module: address_management_api

AWS Lambda function `add_shipping_address` adds shipping/billing addresses to user profiles.
Handles HTTP requests, validates permissions via Amazon Cognito, and stores data in MongoDB.

Dependencies:
- json: Parsing JSON data.
- pymongo: MongoDB driver.
- os: Accessing environment variables.
- lib.common_helper.Encoder: Custom JSON encoder.

Response Structure:
- JSON response with status code, headers, and message.
"""
import json
from pymongo import MongoClient
import os
from lib.common_helper import Encoder
import datetime

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def add_shipping_address(event, context):
    """
    The `add_shipping_address` function is used to add a shipping or billing address to a user's
    profile.

    :param event: The `event` parameter is the input event data that triggers the function. It contains
    information about the HTTP request that was made to invoke the function
    :param context: The `context` parameter is a context object that provides information about the
    runtime environment of the function. It includes details such as the AWS request ID, function name,
    and other metadata
    :return: a JSON response with a status code, headers, and a message. The specific response depends
    on the execution path and any errors encountered.
    """
    # Parse the request body to get the token and buyer_
    try:
        print('event', event['requestContext']['authorizer']['claims'] )
        try:
            cognito_data = json.loads(json.dumps(
                event['requestContext']['authorizer']['claims']))
            print('cognito data', cognito_data)
            email_address = cognito_data['email']
            print('email', email_address)
            if "cognito:groups" not in cognito_data :
                return {
                    "statusCode": 403,
                    "headers": headers,
                    "body": json.dumps({"message": "You do not have access to perform this API action"})
                }
        except Exception as e:
            print('error', e)
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        # Create a SetupIntent to confirm the PaymentMethod
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        address_collection = db[os.environ['ADDRESS_COLLECTION']]
        request_body = json.loads(event['body'])
        insert_data = {}

        insert_data["first_name"] = request_body.get('first_name',"")
        insert_data["last_name"] = request_body.get('last_name',"")
        insert_data["address_line1"] = request_body.get('address_line1',"")
        insert_data["address_line2"] = request_body.get('address_line2',"")
        insert_data["city"] = request_body.get('city',"")
        insert_data["state"] = request_body.get('state',"")
        insert_data["postal_code"] = request_body.get('postal_code',"")
        insert_data["country"] = request_body.get('country',"")
        insert_data["type"] = request_body.get('type',"shipping")
        insert_data["default"] = request_body.get('default',"False")
        insert_data["created_at"]= datetime.datetime.utcnow()

        insert_data["email_address"] = email_address

        if insert_data["default"] == True:
            result = address_collection.update_many(
            {'email_address': email_address, 'default': True, 'type': insert_data["type"]}, {'$set': {'default': False}})
        result = address_collection.insert_one(insert_data)
        return {
            "statusCode": 201,
            'headers': headers,
            "body": json.dumps({'message': "Address added successfully!"})
        }
    except Exception as err:
        print(err)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "There was an error while adding the address"}, cls=Encoder)
        }
