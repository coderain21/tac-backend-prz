'''This api is used to delete the buyer by admin'''
# from datetime import datetime
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
register_auction_collection = db[os.environ['REGISTER_AUCTION_COLLECTION']]
wishlist_collection = db[os.environ['BUYER_WISHLIST_TABLE_NAME']]
# access_log_collection = db[os.environ['ACCESS_LOG_COLLECTION']]
# admin_collection = db[os.environ["ADMIN_USER_COLLECTION"]]
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
        register_result = register_auction_collection.delete_many({"email_address": buyer_email})
        wishlist_result = wishlist_collection.delete_many({"email_address": buyer_email})
        # admin_record = admin_collection.find_one({"email_address": email_address})
        cognito_delete = cognito_client.admin_delete_user(UserPoolId=os.environ["BUYER_COGNITO_USERPOOL_ID"], Username=buyer_email)
        print('cognito_delete', cognito_delete)
        print('result', result)
        # timestamp_ms = int(datetime.now().timestamp() * 1000)
        # formatted_timestamp = float(timestamp_ms)
        # access_log_data = {
        #     "actor_id": admin_record.get('user_id'),
        #     "updated_by": {
        #         "type": 'Admin',
        #         "name": admin_record.get('first_name') + ' ' + admin_record.get('last_name'),
        #         "email_address": email_address,
        #     },
        #     "section": {
        #         "name": 'Bidder Management',
        #         "action": 'Delete',
        #         "buyer_email": buyer_email,
        #     },
        #     "updated_at": formatted_timestamp,
        # }

        if result and register_result and wishlist_result:
            email_status = send_pinpoint_email(email_address, os.environ["SES_SENDER_EMAIL_ID"], json.dumps({"buyer_email": buyer_email}),
                                        os.environ["TEMPLATE_ARN_ADMIN_DELETE_BUYER"])
            print('email_status', email_status)
            # access_log_collection.insert_one(access_log_data)
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