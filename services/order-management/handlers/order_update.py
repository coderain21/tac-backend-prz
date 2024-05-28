'''this api will update a order'''
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
def order_update(event, context):
    '''
    The `order_update` function retrieves order details from a MongoDB database based on the provided
    order ID and the authenticated user's email address.
    :param event: The `event` parameter is the input event data that triggers the function. It contains
    information about the HTTP request that was made to invoke the function
    :param context: The `context` parameter is a context object that provides information about the
    runtime environment of the function. It includes details such as the AWS request ID, function name,
    and other metadata. In this code, the `context` parameter is not used, but it is typically included
    in AWS Lambda function signatures
    :return: a response object with a status code, headers, and a body. The body contains a JSON object
    with the data of the order detail.
    '''
    try:
        # TODO: Add Authorization check
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
            'billing_address':1,
            'shipping_address':1,
            'name': 1,
        }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ['ORDERS_COLLECTION']]
        body = json.loads(event['body'])
        order_id = body['order_id']
        payment_status = body['payment_status']
        payment_method = body['payment_type']
        if (not order_id or not payment_status or not payment_method):
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Bad reqeust'})
            }
        order_data = collection.find_one({'_id': ObjectId(order_id)},projection)
        print('order_data', order_data)
        if order_data is None:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'message': 'No orders found'})
            }
        if (order_data['payment_status'] == 'Paid'):
            return {
                'statusCode': 403,
                'headers': headers,
                'body': json.dumps({'message': 'Can not update paid order'})
            }
        update_data = {
            'payment_status': payment_status,
            'payment_method_types': [payment_method],
        }
        collection.update_one({'_id': ObjectId(order_id)}, {'$set': update_data})
        return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'data':order_data},cls = Encoder)
            }
    except Exception as err:
        print(err)
        return {
            'headers': headers,
            'statusCode': 500,
            'body': json.dumps({'message': 'There was an error '})
        }