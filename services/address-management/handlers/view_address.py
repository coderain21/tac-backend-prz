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
            cognito_data = json.loads(event['requestContext']['authorizer']['data'])
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
        collection = db['dev-address-management']
        request_body = json.loads(event['body'])
        type= request_body['type']
        result = collection.find({'email_address':email_address,'type':type})
        return {
                    "statusCode": 200,
                    'headers': headers,
                    "body": json.dumps({"result":list(result)},cls=Encoder)
                }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": e}, cls=Encoder)
            }