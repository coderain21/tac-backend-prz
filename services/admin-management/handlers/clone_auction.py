''' the function is used to clone auction'''
import os
import json
from pymongo import MongoClient
import datetime

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def clone_auction(event, context):
    """
    The function `clone_auction` is used to clone an auction.

    :param event: The event parameter is an object that contains information about the event that
    triggered the function. This can include details such as the event type, event source, and any
    event-specific data
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other metadata
    """
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        request_body = json.loads(event['body'])
        print('request_body', request_body)
        auction_id = request_body.get('auction_id')
        seller_email = request_body.get('seller_email')
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        counter_collection = db[os.environ["COUNTER_LOT"]]
        user_collection = db[os.environ['SELLERS_TABLE']]

        result= user_collection.find_one({"user_type":"admin","email_address":email_address})
        if result is None:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        auction = auction_collection.find_one(
            {"auction_id": auction_id, "seller_email": seller_email}, {"_id": 0})
        if not auction:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Auction with given ID not found"})
            }
        if auction['status'] not in ['Draft', 'Published', 'Completed']:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Cannot clone an active auction"})
            }
        counter = counter_collection.find_one_and_update(
            {'auction_id': seller_email,
                'record_type': 'Auctions', 'status': 'Active'},
            {'$inc': {'starting_sequence': 1}},
            upsert=True,
            return_document=True
        )
        sequence_number = f"A{str(counter['starting_sequence']).zfill(4)}"
        print(sequence_number)

        # seq = auction_collection.find({'auction_id': sequence_number, 'seller_email': seller_email})
        # if seq:
        #     return {
        #         "statusCode": 400,
        #         "headers": headers,
        #         "body": json.dumps({"message": "Sequence number already exists"})
        #     }

        auction['auction_id'] = sequence_number

        auction['created_at'] = datetime.datetime.utcnow()

        auction["status"] = "Draft"

        auction['total_lots'] = 0
        # Insert the lot data into the MongoDB collection
        auction_collection.insert_one(auction)
        client.close()
        return {
            'headers': headers,
            "statusCode": 201,
            "body": json.dumps({"message": "Auction has been cloned successfully"})
        }
    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"message": "Internal server error"})
        }
