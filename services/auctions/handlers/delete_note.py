# ignored-modules=data,data.get,utils.helper, lib.common_helper,handlers,entities,lib.email_helper,dredd_hooks
# allow-wildcard-with-all=yes
# disable=E0102,W0631,W0105,R1723,W0612,E1305,C0206,W0613,W0640,W0702, E0202,C0411, E0611,W3101, W0603,W0621,W3101,W0622,C0412,R1711, E1101,E1136,C0209,R1733, R1705, C0121, C0103,C0304, C0301, E0401, R0903,R0911,R1710,W0703,R1702,R0912,W1510,W1514,R1732,W1309,R0914,R0915,W0718,R0801'''
'''The `import json` statement is importing the `json` module in Python.'''
import json
import os
from pymongo import MongoClient
# ignored-modules=data,data.get,utils.helper, lib.common_helper,handlers,entities,lib.email_helper,dredd_hooks

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

''' The `delete_note` function is a Python function that handles an API endpoint for deleting or adding
 a note to a document in a MongoDB collection'''.
def delete_note(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
            print('email',email_address)
            # email_address='sthuthi@7edge.com'
        except:
            return {
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
                    "statusCode": 200,
                    "body": json.dumps({"message": "Note field successfully emptied"})
                }
            else:
                return {
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
                    "statusCode": 200,
                    "body": json.dumps({"message": "Note field successfully added"})
                }
            else:
                return {
                    "statusCode": 404,
                    "body": json.dumps({"message": "Document not found or note field already empty"})
                }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"message": "Internal Server Error: " + str(e)})
        }