'''this api will list all the lots'''
import json
import os
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
def order_detail(event, context):
    """
    The above function is a Python code that retrieves cart details for a specific auction from a
    MongoDB database, based on the user's email address.
    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. It typically includes details such as the HTTP request, headers, and query
    parameters
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other contextual information. In this code snippet, the `context` parameter is not used
    :return: The code is returning a response object with a status code, headers, and a body. The body
    contains a JSON object with a "data" key, which holds the cart details.
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
        # email_address= 'aishwarya@7edge.com'
        projection={
            'order_number':1,
            'created_at':1,
            'auction_title':1,
            'purchases':1,
            'payment_method_types':1,
            'payment_status':1,
            'amount':1,
            'payment_intent':1,
            'email_address':1,
            'status':1,
            "billing_address":1,
            "shipping_address":1
        }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ['ORDER_COLLECTION']]
        data = event['queryStringParameters']
        order_id = data['order_id']
        order_data = collection.find_one({'_id':ObjectId(order_id),'email_address':email_address},projection)
        if order_data is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "No orders found"})
            }
        return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps({"data":order_data},cls = Encoder)
            }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
        }