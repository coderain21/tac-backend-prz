''' The `import` statement in Python is used to import modules or packages into your code.'''
import os
import json
import pymongo
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db[os.environ["LOT_COLLECTION_NAME"]]
auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]

def delete_lot(event, context):
    """
    The function "delete_lot" is used to delete a lot.

    :param event: The event parameter is an object that contains information about the triggering event
    that caused the function to be invoked. This can include details such as the event type, event
    source, and any event-specific data
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the function's execution ID, the function's
    name, and the function's memory limit
    """
    try:
        try:
            seller_email = event['requestContext']['authorizer']['claims']['email']
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
            print('email', seller_email)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        # Parse the incoming JSON request
        # Initialize the MongoDB client
        # collection = db[os.environ["LOT_COLLECTION_NAME"]]
        # auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        request_body = json.loads(event['body'])
        print(request_body)

        # Check if the request includes the necessary data for lot identification
        lot_number = request_body.get('lot_number', 0)
        auction_id = request_body.get('auction_id','')

        if not lot_number or not seller_email:
            return {
                "statusCode": 400,
                'headers': headers,
                "body": json.dumps({
                    "message": "Both lot_number and seller_email are required for lot deletion."
                })
            }

        # Delete the specified lot from the MongoDB collection
        delete_result = collection.delete_one({
            "lot_number":lot_number, "seller_email": seller_email,"auction_id": auction_id
            })

        if delete_result.deleted_count == 1:
            auction_record = auction_collection.find_one({"auction_id": auction_id, "seller_email": seller_email})

            if auction_record and "total_lots" in auction_record and auction_record["total_lots"] > 0:
                # Decrease the existing "total_lots" count
                auction_collection.update_one(
                    {"auction_id": auction_id, "seller_email": seller_email},
                    {"$inc": {"total_lots": -1}}
                )
            else:
                # Calculate the total lots count (if not already calculated) and update the auction record
                total_lots_count = collection.count_documents({"seller_email": seller_email, "auction_id": auction_id})
                auction_collection.update_one(
                    {"auction_id": auction_id, "seller_email": seller_email},
                    {"$set": {"total_lots": total_lots_count}}
                )
            return {
                "statusCode": 200,
                'headers': headers,
                "body": json.dumps({"message": " deleted successfully."})
            }
        else:
            return {
                "statusCode": 404,
                'headers': headers,
                "body": json.dumps({
                    "message": "email not found"
                })
            }
    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }
