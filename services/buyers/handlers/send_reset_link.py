"""
This module contains the function to send a reset link for password recovery.
"""
import os
import datetime
import jwt
import json
from lib.get import fetch_seller_data_from_auction,fetch_buyer_data
from lib.helper_python import send_pinpoint_email
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': False,
}

jwt_secret = os.environ.get('JWT_SECRET_KEY')
dt = datetime.datetime.now() + datetime.timedelta(hours=1)

def send_reset_link(event, context):
    """
    Sends a reset link for password recovery to the specified email address.

    Args:
        event: The event object containing the request data.
        context: The context object for the AWS Lambda function.

    Returns:
        A dictionary containing the response data.
    """
    try:
        data = json.loads(event['body'])
        expected_fields = ["auction_id", "domain" ,"email_address","logo_image"]
        fields_not_found = list(set(expected_fields).difference(data.keys()))
        if fields_not_found:
            return {"headers": headers,
                    'statusCode': 400,
                    "body": json.dumps(
                        {"message": f"Please provide {','.join(fields_not_found)}"})
                    }
        auction_id = data.get("auction_id")
        email_address = data.get("email_address")
        domain = data.get("domain")

        seller_data = fetch_seller_data_from_auction(auction_id)
        token = jwt.encode({"email_address": email_address,'exp': dt}, jwt_secret, algorithm="HS256")
        print(token)
        # token = str(token)[2:-1]
        token = str(token)
        baseurl = "https://"+domain+os.environ.get('BASE_URL_BUYER')
        router = os.environ.get('VERIFY_TOKEN_ROUTER_URL', "/verify_token")
        link = str(baseurl) + str(router) + '?token=' + str(token) +'&_id=' + auction_id

        if seller_data:
            buyer_data = fetch_buyer_data(seller_data["seller_email"],email_address)

            if buyer_data:
                send_pinpoint_email(email_address,os.environ["SENDER_EMAIL_ADDRESS"],json.dumps({'link': link, 'logo_image': data['logo_image']}),os.environ["TEMPLATE_ARN_EMAIL_RESET_PASSWORD"])
                return {
                    "headers": headers,
                    "statusCode": 201,
                    "body": json.dumps({"message": "Password Reset Instructions sent successfully"})
                }
            else:
                return {
                    "headers": headers,
                    "statusCode": 404,
                    "body": json.dumps({"message": "Invalid or Unregistered email_address"})
                }
        else:
            return {
                "headers": headers,
                "statusCode": 404,
                "body": json.dumps({"message": "Invalid or Unregistered email_address"})
            }
    except BaseException as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps(
                {"message": "There was an error while resetting password, Please try again!"})}
