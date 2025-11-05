'''this api will list all the lots'''
import json
import os
from pymongo import MongoClient
from lib.common_helper import Encoder
from lib.get import get_by_email, fetch_seller_data_from_auction

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
collection = db[os.environ['CART_COLLECTION']]
buyer_collection = db[os.environ['BUYER_COLLECTION']]


def view(event, context):
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
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
            print('email', email_address)
        except:
            print('here in second')
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        buyer_details = buyer_collection.find_one({'email_address':email_address})
        if buyer_details is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Buyer doesn't exist"})
            }

        data = event['queryStringParameters']
        auction_id = data['auction_id']
        plan_type = "Free"
        seller_payment_status = {"paypal_status": "", "stripe_status": ""}   #need to assign empty for the object
        auction_data = fetch_seller_data_from_auction(auction_id)
        if auction_data is not None:
            seller_email = auction_data["seller_email"]
            seller_data = get_by_email(seller_email,os.environ['SELLERS_TABLE'])
            if seller_data is not None:
                plan_type = seller_data["plan_type"]

            #this is to check whether the seller is connected to stripe or paypal for payment flow
                seller_payment_status['paypal_status'] = 'connected' if seller_data.get('paypal_status') == 'connected' else ''
                seller_payment_status['stripe_status'] = 'connected' if seller_data.get('stripe_status') == 'connected' else ''

        cart_details= collection.find({'email_address':email_address,'auction_id':auction_id})
        if cart_details is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "No Lots found"})
            }
        return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps({"data":list(cart_details),"plan_type":plan_type, "seller_payment_status": seller_payment_status},cls = Encoder)
            }
    except Exception as err:
        print('Error',err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
        }