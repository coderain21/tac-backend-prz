import os
import json
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

def clone_auction(event, context):
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
        _id = request_body.get('object_id')
        
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        counter_collection = db[os.environ["COUNTER_LOT"]]
        user_collection = db[os.environ['SELLERS_TABLE']]
        
        result = user_collection.find_one({"user_type": "admin", "email_address": email_address})
        if result is None:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        auction = auction_collection.find_one({'_id': ObjectId(_id)}, {'_id': 0})
        if not auction:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Auction with given ID not found"})
            }
        
        seller_email = auction['seller_email']
        if auction['status'] not in ['Draft', 'Published', 'Completed']:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Cannot clone an active auction"})
            }
        
        # Check the document before update
        existing_document = counter_collection.find_one({
            'auction_id': seller_email,
            'record_type': 'Auctions',
            'status': 'Active'
        })
        print('existing_document before update', existing_document)
        
        # Perform the update
        counter = counter_collection.find_one_and_update(
            {'auction_id': seller_email,
             'record_type': 'Auctions', 'status': 'Active'},
            {'$inc': {'starting_sequence': 1}},
            upsert=True,
            return_document=True
        )
        print('counter after update', counter)
        
        # Check the document after update
        updated_document = counter_collection.find_one({
            'auction_id': seller_email,
            'record_type': 'Auctions',
            'status': 'Active'
        })
        print('updated_document after update', updated_document)
        
        # Generate the sequence number
        sequence_number = f"A{str(counter['starting_sequence']).zfill(4)}"
        print('sequence_number', sequence_number)

        auction['auction_id'] = sequence_number
        auction['created_at'] = datetime.datetime.utcnow()
        auction["status"] = "Draft"
        auction['total_lots'] = 0
        
        # Insert the cloned auction into the collection
        auction_collection.insert_one(auction)
        
        client.close()
        return {
            'headers': headers,
            "statusCode": 201,
            "body": json.dumps({"message": "Auction has been cloned successfully"})
        }
    
    except Exception as e:
        print('Exception:', e)
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"message": "Internal server error"})
        }
