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
    The `order_detail` function retrieves order details from a MongoDB database based on the provided
    order ID and the authenticated user's email address.
    :param event: The `event` parameter is the input event data that triggers the function. It contains
    information about the HTTP request that was made to invoke the function
    :param context: The `context` parameter is a context object that provides information about the
    runtime environment of the function. It includes details such as the AWS request ID, function name,
    and other metadata. In this code, the `context` parameter is not used, but it is typically included
    in AWS Lambda function signatures
    :return: a response object with a status code, headers, and a body. The body contains a JSON object
    with the data of the order detail.
    """
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
        # email_address= 'aishwarya@7edge.com'
        projection = {
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
            "shipping_address":1,
            "name": 1,
        }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ['ORDERS_COLLECTION']]
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