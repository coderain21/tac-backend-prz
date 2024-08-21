"""
This module is used to disconnect the paypal connected account
"""
import json
import os
import decimal
from datetime import datetime

from pymongo import MongoClient
from lib.common_helper import update_by_email

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': False,
}


mongo_client = MongoClient(
    os.environ['MONGO_CLIENT']
)
db = mongo_client[os.environ['DATABASE']]
seller_collection = db[os.environ['SELLERS_TABLE']]

class Encoder(json.JSONEncoder):
    """
    Custom JSON Encoder to handle special types.

    Handles encoding of Decimal, bytes, and datetime objects.
    """

    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return str(o)
        if isinstance(o, bytes):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)


def disconnect_account(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
        except:
            return {
                "headers": headers,
                "statusCode": 403,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        user_info = seller_collection.find_one({"email_address": email_address})

        if user_info is None:
            return {
                "headers": headers,
                "statusCode": 404,
                "body": json.dumps({"message": "User not found!"})
            }

        if "paypal_status" in user_info:
            update_data = {
                "paypal_status": "disconnected"
            }
            update_status = update_by_email(
                email_address, update_data, os.environ["SELLERS_TABLE"])
            print(update_status)

        return {
            "headers": headers,
            'statusCode': 204,
            'body': json.dumps({
            },
                cls=Encoder)
        }

    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error while disconnecting the paypal account"})
        }
