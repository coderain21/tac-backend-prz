'''this api for details of sales'''
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
def sales_details(event, context):
    """
    The `sales_details` function retrieves sales details for a specific order based on the order ID and
    the seller's email.
    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. It typically includes details such as the HTTP request, headers, query
    parameters, and body
    :param context: The `context` parameter is a context object that provides information about the
    runtime environment of the function. It includes details such as the AWS request ID, function name,
    and other metadata. In this code, the `context` parameter is not used, but it is typically included
    in AWS Lambda function signatures
    :return: The code is returning a JSON response with the following structure:
    """
    try:
        try:
            seller_email = event['requestContext']['authorizer']['claims']['email']
            print('email ', seller_email)
            if ("cognito:groups" in event['requestContext']['authorizer']['claims'] and not
                    'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]):
                return {
                    "statusCode": 403,
                    "headers": headers,
                    "body": json.dumps({"message": "do not have access to perform this API action"})
                }
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

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
            "shipping_address":1,
            'seller_email':1,
            'name': 1
        }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ['ORDERS_COLLECTION']]
        data = event['queryStringParameters']
        order_id = data['order_id']
        order_data = collection.find_one({'_id':ObjectId(order_id),'seller_email':seller_email},projection)
        print(order_data)
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