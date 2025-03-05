'''this api will get the paddle number of the buyer for a particular auction'''
import json
import os
from bson import ObjectId
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
auction_collection = db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]

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
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
            print('email', email_address)
        except:
            print('here in second')
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        data = event['queryStringParameters']
        auction_id = data['auction_id']

        if not auction_id:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }
        
        try: 
            auction_id = ObjectId(auction_id)
        except Exception as e:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Invalid auction_id format"})
            }

        auction_data = auction_collection.find_one({"_id": auction_id})
        seller_email = auction_data['seller_email']
        buyer_data = buyers_collection.find_one({"email_address": email_address, "seller_email": seller_email})
        actor_id = buyer_data.get('buyer_id')
        name = ' '.join(filter(None, [buyer_data.get('first_name'), buyer_data.get('last_name')]))

        # Get the current timestamp in seconds and convert to milliseconds
        timestamp_ms = int(datetime.datetime.now().timestamp() * 1000)

        # Convert to float and format as a string with '.0'
        formatted_timestamp = float(timestamp_ms)
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
            "updated_at": formatted_timestamp
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