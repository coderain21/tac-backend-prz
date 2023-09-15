"""This module is used to view the auction with auction id"""
import json
import os
from pymongo import MongoClient
from lib.common_helper import Encoder

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def view(event, context):
    """
    The `view` function retrieves auction data based on the provided auction ID and the authenticated
    user's email address.
    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. It typically includes details such as the HTTP request, headers, and body
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name,and
    other contextual information. In this code snippet, the `context` parameter is not used, but it is
    typically included in AWS Lambda function
    :return: a JSON response with a status code, headers, and a body. The specific response depends on
    the conditions and data being processed in the function.
    """
    try:
        try:
            # email_address = event['requestContext']['authorizer']['claims']['email']
            email_address="anusha.k+indyauction@7edge.com"
            print('email', email_address)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        data = event['queryStringParameters']
        if data is None or "auction_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }

        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        auction_id = data["auction_id"]
        projection = {
            "_id": 0,
            "auction_id": 1,
            "title": 1,
            "start_date": 1,
            "end_date": 1,
            "status": 1,
            "auction_image": 1,
            "note": 1,
            "created_at": 1,
            "currency": 1,
            "description": 1,
            "time_zone": 1,
            "extension_type": 1,
            "extension_time": 1,
            "extension_time_between_lots": 1,
            "registration_type": 1,
            "add_buyer_fees": 1,
            "fees": 1,
            "make_your_auction_private": 1,
            "passcode": 1,
            "menu_links": 1,
            "footer.background_color": 1,
            "footer.text_color": 1,
            "buttons.background_color": 1,
            "buttons.text_color": 1,
            "content_area.background_color": 1,
            "content_area.text_color": 1,
            "header.background_color": 1,
            "header.text_color": 1,
            "font.hearder_font": 1,
            "font.body_font": 1,
            "logo_image": 1,
        }
        result = collection.find_one({"seller_email": email_address,
                                      "auction_id": auction_id}, projection)

        if result is None:
            return {
            "headers": headers,
            "statusCode": 404,
            "body": json.dumps({"message": "Auction with associated auction_id doesn't exists"})
        }

        client.close()
        body = {
            "data": result,
        }
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(body, cls=Encoder)
        }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
        }
    