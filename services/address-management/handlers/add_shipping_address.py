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
        try:
            cognito_data = json.loads(
                event['requestContext']['authorizer']['data'])
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
        # Create a SetupIntent to confirm the PaymentMethod
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ['ADDRESS_COLLECTION']]
        request_body = json.loads(event['body'])
        data = event['queryStringParameters']
        try:
            address_line1 = request_body['address_line1']
            address_line2 = request_body['address_line2']
            city = request_body['city']
            state = request_body['state']
            postal_code = request_body['postal_code']
            country = request_body['country']
            type = request_body['type']
            same = request_body['same']
        except:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "please provide the required fields"})
            }
        request_body.pop('same')
        request_body['email_address'] = email_address
        address = collection.find_one(
            {'email_address': email_address, 'type': type})
        if address is None:
            default = True
        else:
            default = False
        request_body['default'] = default
        if type == 'shipping' or same == 'True':
            request_body['type'] = 'shipping'
            result = collection.insert_one(request_body)
        if type == 'billing' or same == 'True':
            request_body['type'] = 'billing'
            result = collection.insert_one(request_body)
        return {
            "statusCode": 204,
            'headers': headers,
            "body": json.dumps({'message': "sucessfull"})
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": e}, cls=Encoder)
        }
