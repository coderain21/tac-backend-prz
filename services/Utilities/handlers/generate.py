"""
This module is used to generate token for the kyc
"""
import json
import os
# import uuid
import decimal
from datetime import datetime
from data.kyc import get_access_token
# from data.get import get_by_email

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


def generate_token(event,context):
    try:
        # try:
        #     email_address = event['requestContext']['authorizer']['claims']['email']
        #     user_info = get_by_email(email_address)
        # except:
        #     return {
        #         "headers": headers,
        #         "statusCode": 403,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }

        external_user_id = "85f0add1-c001-4680-a25d-4b3bd3db2a05"
        level_name = os.environ['LEVEL_NAME']
        token=get_access_token(external_user_id, level_name)
        return {
            "headers": headers,
            'statusCode': 200,
            'body': json.dumps({
                'token': token
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