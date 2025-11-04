"""
This module contains the function to send a reset link for password recovery.
"""
import os
import json
from lib.get import get_by_email
from utils.helper import send_mail_reset_password
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': False,
}


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
        if 'email_address' not in data:
            return {
                "headers": headers,
                "statusCode": 400,
                "body": json.dumps({"message": "Please provide email_address"})}
        collection = os.environ["SELLERS_TABLE"]
        admin_info = get_by_email(data['email_address'],collection)
        if admin_info:
            send_mail_reset_password(data['email_address'])
            return {
                "headers": headers,
                "statusCode": 201,
                "body": json.dumps({"message": "Password Reset Instructions sent successfully"})
            }
        return {
            "headers": headers,
            "statusCode": 404,
            "body": json.dumps({"message": "Invalid or Unregistered email_address"})
        }
    except BaseException as err:
        print('Error',err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps(
                {"message": "There was an error while resetting password, Please try again!"})}
