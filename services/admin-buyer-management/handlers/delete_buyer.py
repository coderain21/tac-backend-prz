import json
import pymongo
import os
from lib.helper_python import send_pinpoint_email
import boto3


headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}
client = pymongo.MongoClient(os.environ['MONGO_CLIENT'],
                             maxIdleTimeMS=60000)
db = client[os.environ['DATABASE']]
buyer_collection = db[os.environ['BUYER_COLLECTION']]
cognito_client = boto3.client('cognito-idp', region_name=os.environ['REGION'])

def delete_buyer(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
            print('email', email_address)
        except Exception as err:
            print("Error",str(err))
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        buyer_email = event['queryStringParameters']['buyer_email']
        print('buyer_email', buyer_email)
        result = buyer_collection.delete_many({"email_address": buyer_email})
        cognito_delete = cognito_client.admin_delete_user(UserPoolId=os.environ["BUYER_COGNITO_USERPOOL_ID"], Username=buyer_email)
        print('cognito_delete', cognito_delete)
        print('result', result)
        
        if result:
            email_status = send_pinpoint_email(email_address, os.environ["SES_SENDER_EMAIL_ID"], {"buyer_email": buyer_email},
                                        os.environ["TEMPLATE_ARN_ADMIN_DELETE_BUYER"])
            print('email_status', email_status)
            if email_status:
                return {
                    "statusCode": 200,
                    "headers": headers,
                    "body": json.dumps({"message": "Buyer deleted successfully"})
                }
            else:
                return {
                    "statusCode": 500,
                    "headers": headers,
                    "body": json.dumps({"message": "Error while sending email"})
                }
        else:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Buyer not found"})
            }
    except Exception as err:
        print("Error",str(err))
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "Internal Server Error"})
        }