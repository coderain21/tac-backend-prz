import json
import os
import stripe
import decimal
from pymongo import MongoClient
from datetime import datetime
from data.get import get_by_email
from lib.common_helper import update_by_email

stripe.api_key = os.environ["STRIPE_API_KEY"]



headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': False,
}

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


def create(event,context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
            # email_address = "sandhyashri+test45@7edge.com"
        except:
            return {
                "headers": headers,
                "statusCode": 403,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        user_info = get_by_email(email_address)
        
        if not "stripe_connected_id" in user_info:
            created_account = stripe.Account.create(
                    type = "express",
                    email = email_address,
                    )
            stripe_id = created_account["id"]
            # stripe_id = "acct_1NhRrTCSxvBdz2xP"
            print(stripe_id)
            update_data = {
                "stripe_connected_id" : stripe_id
            }
            update_status = update_by_email(email_address,update_data,os.environ["SELLERS_TABLE"])
            print(update_status)
        else:
            stripe_id = user_info["stripe_connected_id"]

        account_link = stripe.AccountLink.create(
            account = stripe_id,
            refresh_url="https://seller-dev.indyauction.net/",
            return_url="https://seller-dev.indyauction.net/",
            type="account_onboarding",
            )
        url = account_link["url"]
     
        return {
            "headers": headers,
            'statusCode': 200,
            'body': json.dumps({
                'stripe_url': url
            },
                cls=Encoder)
        }

    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error while generating token"})
        }