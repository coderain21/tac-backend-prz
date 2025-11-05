"""
This module is used to connect the sellers to the platform account
"""
import json
import os
import stripe
import decimal
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


def create(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
        except:
            return {
                "headers": headers,
                "statusCode": 403,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        user_info = get_by_email(email_address)

        # restricting free tier users from connecting to stripe.
        if "plan_type" in user_info and user_info.get("plan_type") == "Free":
            print("free_user")
            return {
                "headers": headers,
                "statusCode": 403,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        if not "stripe_connected_id" in user_info:
            created_account = stripe.Account.create(
                type="standard",
                email=email_address,
            )
            stripe_id = created_account["id"]
            print(stripe_id)
            update_data = {
                "stripe_connected_id": stripe_id
            }
            update_status = update_by_email(
                email_address, update_data, os.environ["SELLERS_TABLE"])
            print(update_status)
        else:
            stripe_id = user_info["stripe_connected_id"]

        if "account_linked" in user_info and user_info["account_linked"] == 1:
            update_data = {
                "stripe_status": "connected"
            }
            update_status = update_by_email(
                email_address, update_data, os.environ["SELLERS_TABLE"])
            url = ""
        else:
            account_link = stripe.AccountLink.create(
                account=stripe_id,
                refresh_url=os.environ["DASHBOARD_URL"],
                return_url=os.environ["DASHBOARD_URL"],
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
        print('Error',err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error while connecting to stripe"})
        }
