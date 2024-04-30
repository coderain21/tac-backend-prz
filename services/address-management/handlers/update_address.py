'''this api will update the shipping and billing address'''
import json
from pymongo import MongoClient
import os
from lib.common_helper import Encoder
from bson import ObjectId
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def update_address(event, context):
    """
    The `update_address` function updates the default address for a user in a MongoDB collection based
    on the provided address ID and user email.
    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. It typically includes details such as the HTTP request, headers, body, and
    other relevant data
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other contextual information. In this code snippet, the `context` parameter is not used, so it can
    be removed from the function signature
    :return: The code is returning a JSON response with a status code, headers, and a body. The specific
    response depends on the execution path of the code.
    """
    try:
        try:
            cognito_data = json.loads(
                event['requestContext']['authorizer']['data'])
            email_address = cognito_data['email']
            if "cognito:groups" not in cognito_data :
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
            address_id = data['address_id']
        except:
            return {
                "statusCode": 400,
                'headers': headers,
                "body": json.dumps({"message": "please provide the address_id."})
            }
        address_data = collection.find_one({'_id': ObjectId(address_id)})
        if address_data is None:
            return {
                "statusCode": 404,
                'headers': headers,
                "body": json.dumps({"message": "Address with given address_id not found."})
            }
        type = request_body['type']
        result = collection.update_many(
            {'email_address': email_address, 'default': True, 'type': type}, {'$set': {'default': False}})
        result = collection.update_one({'_id': ObjectId(address_id)}, {
                                       '$set': {'default': True}})

        return {
            "statusCode": 204,
            'headers': headers,
            "body": json.dumps({})
        }
    except Exception as err:
        print(err)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "There was an error while updating the address"}, cls=Encoder)
        }
