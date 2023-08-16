'''This module is used as webhook for the sumsub kyc'''
import json
import os
import uuid
import decimal
from pymongo import MongoClient
from datetime import datetime
from lib.common_helper import get_access_token,create_applicant

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
        try:
            # email_address = event['requestContext']['authorizer']['claims']['email']
            email_address = "namratha.shettigar@7edge.com"
            print('email',email_address)
        except:
            return {
                "headers": headers,
                "statusCode": 403,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        level_name = os.environ['KYB_LEVEL_NAME']
        print('leve', level_name)
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection_sellers = db[os.environ["SELLERS_TABLE"]]

        user_info = collection_sellers.find_one({'email_address': email_address},{'password':0})
        print('user', user_info)

        if "kyb_reviewResult" in user_info and "kyb_reviewAnswer" in user_info["kyb_reviewResult"] and user_info["kyb_reviewResult"]["kyb_reviewAnswer"]=="RED":
            del user_info["kyb_external_user_id"]
            del user_info["companyId"]
            del user_info["kyb_reviewResult"]

        if not "companyId" in user_info and not "kyb_external_user_id" in user_info:
            kyb_external_user_id = str(uuid.uuid4())
            company_id = create_applicant('company',kyb_external_user_id,level_name)
            user_info["kyb_external_user_id"] = kyb_external_user_id
            user_info["companyId"] = company_id
            # Update the user_activity document
            collection_sellers.update_one({"_id": user_info["_id"]}, {
                              "$set": user_info})
        else:
            kyb_external_user_id = user_info["kyb_external_user_id"]


        token=get_access_token(kyb_external_user_id, level_name)
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