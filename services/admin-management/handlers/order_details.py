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

client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
client = MongoClient(os.environ['MONGO_CLIENT'])
# db = client[os.environ['DATABASE']]
collection = db[os.environ['ORDERS_COLLECTION']]
user_collection = db[os.environ['SELLERS_TABLE']]
collection = db[os.environ['ORDERS_COLLECTION']]
buyer_collection = db[os.environ['BUYER_COLLECTION']]
card_collection = db[os.environ['CREDIT_CARD_COLLECTION']]

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
        # try:
        #     email_address = event['requestContext']['authorizer']['claims']['email']
        # except:
        #     return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }
        # buyer_email_address= 'anusha.k+newacc1@7edge.com'

        
        # result= user_collection.find_one({"user_type":"admin","email_address":email_address})
        # if result is None:
        #     return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }
        projection={
            'order_number':1,
            'created_at':1,
            'auction_title':1,
            'purchases':1,
            'payment_method_types':1,
            'payment_status':1,
            'payment': 1,
            'amount':1,
            'payment_intent':1,
            'email_address':1,
            'status':1,
            "billing_address":1,
            "shipping_address":1
        }
        
        
        
        data = event['queryStringParameters']
        order_id = data['order_id']
        order_data = collection.find_one({'_id':ObjectId(order_id)},projection)
        if order_data is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "No orders found"})
            }
        
        buyer_email_address = order_data['email_address']
        buyer_details = buyer_collection.find_one({'email_address':buyer_email_address})
        # print('order details:', order_data)
        print('buyer details:', buyer_details)

        credit_projection = {
            'registration_status': 1,
            '_id': 0
        }

        credit_data_cursor = card_collection.find({'buyer_id': ObjectId(buyer_details['_id'])}, credit_projection)
        # print(credit_data_cursor)
        credit_data_list = list(credit_data_cursor)
        print('credit data list:', credit_data_list)

        if not credit_data_list:
            # Handle the case when no credit data is found
            order_data['card_validations_details'] = None
        else:
            order_data['card_validations_details'] = credit_data_list[0]
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