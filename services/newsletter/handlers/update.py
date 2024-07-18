'''this api is used to newsletter preferences'''
import json
import os
from pymongo import MongoClient

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
seller_collection = db[os.environ['SELLERS_TABLE']]



def update(event, context):
    """
    The above function is a Python code that updates a user's password in a Cognito user pool based on
    certain conditions and returns appropriate responses.

    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. It typically includes details such as the HTTP request, headers, and body
    :param context: The `context` parameter is a context object that provides information about the
    runtime environment of the function. It includes details such as the AWS request ID, function name,
    and other metadata
    :return: a JSON response with a status code, headers, and a message body. The specific response
    depends on the conditions and logic within the function.
    """
    try:
        print('event', event['requestContext']['authorizer']['claims'] )
        try:
            cognito_data = json.loads(json.dumps(
                event['requestContext']['authorizer']['claims']))
            print('cognito data', cognito_data)
            email_address = cognito_data['email']
            print('email', email_address)
            if "cognito:groups" not in cognito_data :
                return {
                    "statusCode": 403,
                    "headers": headers,
                    "body": json.dumps({"message": "You do not have access to perform this API action"})
                }
        except Exception as e:
            print('error', e)
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        data = json.loads(event['body'])
        print('data', data)
        if 'newsletter' not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide newsletter preferences"})
            }
        seller_info = seller_collection.find_one({"email_address": email_address})
        if seller_info:
            seller_info['newsletter_notification'] = data['newsletter'] == 'True'
            seller_collection.update_one({"email_address": email_address}, {"$set": seller_info})

            return {
                "statusCode": 204,
                "headers": headers,
                "body": json.dumps({"message": "Newsletter preferences updated successfully"})
            }
        else:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Seller not found"})
            }

    except Exception as e:
        print('Error', e)
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"message": "Internal server error"})
        }
        