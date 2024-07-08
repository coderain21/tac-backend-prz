'''this api will get the paddle number of the buyer for a particular auction'''
import json
import os
from pymongo import MongoClient
import datetime


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
access_logs_collection = db[os.environ["ACCESS_LOGS_TABLE"]]
buyers_collection = db[os.environ["BUYER_COLLECTION"]]

def buyer_signin_logger(event, context):
    """
    The function `list_lots` retrieves details of a lot from a MongoDB database based on the provided
    lot_id.

    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. In this case, it is expected to have a key called `'queryStringParameters'`
    which contains the query parameters passed to the function
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other contextual information. In this code, the `context` parameter is not used, but it is included
    in the function signature for completeness
    :return: The code is returning a JSON response with a status code, headers, and a body. The specific
    response depends on the execution path of the code.
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

        buyer_data = buyers_collection.find_one({"email_address": email_address})
        actor_id = buyer_data.get('buyer_id')
        name = ' '.join(filter(None, [buyer_data.get('first_name'), buyer_data.get('last_name')]))

        access_logs = {
            "actor_id": actor_id,
            "updated_by": {
                "type": 'Buyer',
                "name": name,
                "email_address": email_address,
            },
            "section": {
                "name": 'Bidder Management',
                "action": 'Login'
            },
            "updated_at": int(datetime.datetime.now().timestamp())
        }

        access_logs_collection.insert_one(access_logs)

        return {
            'statusCode': 201,
            'headers': headers,
            'body': json.dumps({"message": "Logs inserted successfully"})
        }


    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }