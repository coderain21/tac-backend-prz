# pylint: disable=trailing-whitespace
"""This module is used to update seller settings"""

import datetime
import json
import os
from bson import ObjectId

from pymongo import MongoClient


headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

#  Connecting to MongoDB using PyMongo
client = MongoClient(
                os.environ['MONGO_CLIENT'],
                maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                )
db = client[os.environ['DATABASE']]
seller_collection = db[os.environ["SELLERS_TABLE"]]

"""
    The `update_seller_settings` function will update the seller settings
    :param event: The `event` parameter is a dictionary that contains the input data for the function.
    It includes the request body that contains the seller_id and settings to update
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes properties such as the AWS request ID, the function name,
    the function version, and more. This parameter is not used in the code you provided, but it is
    commonly included in AWS Lambda functions
    :return: a dictionary with the following keys:
    - "statusCode": an integer representing the HTTP status code
    - "headers": a dictionary representing the HTTP headers
    - "body": a JSON string representing the response body
"""
def update_seller_settings(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
        except:
            return {
                    "statusCode": 403,
                    "headers": headers,
                    "body": json.dumps({"message": "You do not have access to perform this API action"})
                }

        # Extracting params from the request
        request_body = json.loads(event['body'])
        seller_id = request_body.get("seller_id", None)
        send_automated_auction_complete_email = request_body.get("send_automated_auction_complete_email")
        checkout_enabled = request_body.get("checkout_enabled")

        print(f"Updating seller settings for seller_id: {seller_id}")
        print(f"send_automated_auction_complete_email: {send_automated_auction_complete_email}")
        print(f"checkout_enabled: {checkout_enabled}")

        if seller_id is None or seller_id == "" or seller_id == " ":
            return {
                "statusCode": 422,
                "headers": headers,
                "body": json.dumps({"message": "Invalid request, Seller ID is not provided"})
            }

        if send_automated_auction_complete_email is None:
            return {
                "statusCode": 422,
                "headers": headers,
                "body": json.dumps({"message": "Invalid request, send_automated_auction_complete_email is required"})
            }

        if checkout_enabled is None:
            return {
                "statusCode": 422,
                "headers": headers,
                "body": json.dumps({"message": "Invalid request, checkout_enabled is required"})
            }

        # Validate that send_automated_auction_complete_email is a boolean
        if not isinstance(send_automated_auction_complete_email, bool):
            return {
                "statusCode": 422,
                "headers": headers,
                "body": json.dumps({"message": "Invalid request, send_automated_auction_complete_email must be a boolean value"})
            }

        # Validate that checkout_enabled is a boolean
        if not isinstance(checkout_enabled, bool):
            return {
                "statusCode": 422,
                "headers": headers,
                "body": json.dumps({"message": "Invalid request, checkout_enabled must be a boolean value"})
            }

        # Searching seller existence by id
        seller_detail = seller_collection.find_one({"_id": ObjectId(seller_id)}, {
            "_id": 1
        })
        if seller_detail is None:
            return {
                "statusCode": 422,
                "headers": headers,
                "body": json.dumps({"message":"Seller does not exist."}),
            }

        # updating the seller settings
        query = {"_id": ObjectId(seller_id)}
        new_values = {
            "$set": {
                "send_automated_auction_complete_email": send_automated_auction_complete_email,
                "checkout_enabled": checkout_enabled,
                "updated_at": datetime.datetime.utcnow()
            }
        }

        try:
            result = seller_collection.update_one(query, new_values)

            if result.modified_count > 0:
                return {
                    "statusCode": 200,
                    "headers": headers,
                    "body": json.dumps({
                        "message": "Seller settings updated successfully",
                        "seller_id": seller_id,
                        "send_automated_auction_complete_email": send_automated_auction_complete_email,
                        "checkout_enabled": checkout_enabled
                    })
                }
            else:
                return {
                    "statusCode": 200,
                    "headers": headers,
                    "body": json.dumps({
                        "message": "Seller settings updated successfully (no changes made)",
                        "seller_id": seller_id,
                        "send_automated_auction_complete_email": send_automated_auction_complete_email,
                        "checkout_enabled": checkout_enabled
                    })
                }
        except Exception as update_error:
            print(f"Update error: {str(update_error)}")
            return {
                "statusCode": 500,
                "headers": headers,
                "body": json.dumps({"message":"Update failed, there was an error during update"})
            }
    except Exception as e:
        print(f"Error in update_seller_settings: {str(e)}")
        return {
            "statusCode": 500,
            "headers": headers,
             "body": json.dumps({"message": "There was an error updating seller settings"})
        }