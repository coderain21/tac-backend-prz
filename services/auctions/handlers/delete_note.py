
'''The `import json` statement is importing the `json` module in Python.'''
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

def delete_note(event, context):
    '''The `delete_note` function is a Python function that handles an API endpoint for
    deleting or addinga note to a document in a MongoDB collection'''
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
            print('email ',email_address)
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        except:
            return {
                "headers": headers,
                "statusCode": 403,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        key= event['queryStringParameters'].get('del','0')
        if key == '1':
            auction_id = event['queryStringParameters'].get('auction_id')
            client = MongoClient(os.environ['MONGO_CLIENT'])
            db = client[os.environ['DATABASE']]
            collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
            update = {"$set": {"note": ""}}
            filters = {"seller_email": email_address, "auction_id": auction_id}

            # Perform the update operation
            result = collection.update_one(filters, update)

            # Check if the update was successful
            if result.modified_count > 0:
                return {
                    "headers": headers,
                    "statusCode": 200,
                    "body": json.dumps({"message": "Note field successfully emptied"})
                }
            else:
                return {
                    "headers": headers,
                    "statusCode": 404,
                    "body": json.dumps({"message": "Document not found or note field already empty"})
                }
        elif key == '0':
            auction_id = event['queryStringParameters'].get('auction_id')
            print(event)
            event_body = json.loads(event['body'])
            note = event_body.get('note')
            print('hiiiiiiiiiiiii',note)
            client = MongoClient(os.environ['MONGO_CLIENT'])
            db = client[os.environ['DATABASE']]
            collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
            update = {"$set": {"note": note}}
            filters = {"seller_email": email_address, "auction_id": auction_id}

            # Perform the update operation
            result = collection.update_one(filters, update)

            # Check if the update was successful
            if result.modified_count > 0:
                return {
                    "headers": headers,
                    "statusCode": 200,
                    "body": json.dumps({"message": "Note field successfully added"})
                }
            else:
                return {
                    "headers": headers,
                    "statusCode": 404,
                    "body": json.dumps({"message": "Document not found or note field already empty"})
                }

    except Exception as e:
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "Internal Server Error: " + str(e)})
        }