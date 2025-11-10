"""
Module: address_management_api

AWS Lambda function `view_address` retrieves user addresses from a MongoDB collection based on the provided
type (shipping or billing). Handles HTTP requests, validates permissions via Amazon Cognito, and returns a
JSON response with the user's address information.

Dependencies:
- json: Parsing JSON data.
- pymongo: MongoDB driver.
- os: Accessing environment variables.
- lib.common_helper.Encoder: Custom JSON encoder.

Response Structure:
- JSON response with status code, headers, and a body containing the user's address information.
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

client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
address_collection = db[os.environ['ADDRESS_COLLECTION']]


def view_address(event, context):
    """
    The function "view_address" is used to handle an event and context in Python.

    :param event: The `event` parameter is an object that contains information about the event that
    triggered the function. This can include details such as the event type, event source, and any data
    associated with the event
    :param context: The `context` parameter in the `view_address` function is an object that provides
    information about the runtime environment of the function. It includes details such as the AWS
    request ID, function name, and other contextual information
    """
    try:
        try:
            print('event', event['requestContext'])
            # cognito_data = json.loads(event['requestContext']['authorizer']['data'])
        #     email_address = cognito_data['email']
        #     if "cognito:groups" not in cognito_data :
        #         return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }
        # except:
        #     return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }
            # print('cognito data', cognito_data)
            # email_address = event['requestContext']['authorizer']['claims']['email']
            # print('email', email_address)
            # if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'buyer' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
            #     print('here in first')
            #     return {
            #         "statusCode": 403,
            #         "headers": headers,
            #         "body": json.dumps({"message": "You do not have access to perform this API action"})
            #     }
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
            print('email', email_address)
        except:
            print('here in second')
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        # Create a SetupIntent to confirm the PaymentMethod
        # client = MongoClient(
        #               os.environ['MONGO_CLIENT'],
        #               maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
        #                 )
        # db = client[os.environ['DATABASE']]
        # address_collection = db[os.environ['ADDRESS_COLLECTION']]
        print(event["queryStringParameters"])
        request_body = event["queryStringParameters"]
        type= request_body['type']
        result = address_collection.find({'email_address':email_address,'type':type}).sort('created_at',-1)
        if result is None:
            return {
                    "statusCode": 404,
                    'headers': headers,
                    "body": json.dumps({"message":"No addresses found"})
            }
        else:
            return {
                        "statusCode": 200,
                        'headers': headers,
                        "body": json.dumps({"result":list(result)},cls=Encoder)
                    }
    except Exception as err:
        print("Error", str(err))
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "There was an error getting addresses"})
            }