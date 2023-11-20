import json
import os
from pymongo import MongoClient
from lib.common_helper import Encoder

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def view(event, context):
    try:
        try:
            cognito_data = json.loads(event['requestContext']['authorizer']['data'])
            email_address = cognito_data['email']
            if "cognito:groups" in cognito_data and not 'buyer' in cognito_data["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        data = event['queryStringParameters']
        if data is None or "auction_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }
        auction_id=data['auction_id']
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ['CART_COLLECTION']]
        request_body = json.loads(event['body'])
        request_body['email_address']= email_address
        request_body['auction_id']= auction_id
        cart_details= collection.insert_one({request_body })
        if cart_details is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "No Lots found"})
            }
        return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps({"data":cart_details})
            }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
        }
    





    { "_id": { "$oid": "65408b0df6e44ea2431c62f0" }, "auction_id": "A0076", "seller_email": "sthuthi@7edge.com", "title1": "Beach", "title2": "Beach picture", "description": "<p>This is a beach picture.</p><p>i want to paint it hhjgh</p><p>jhvjvjv</p><p>jbkhbh jfhhg fjghgh</p><p>bhgjhg hgj</p><p>hello</p>", "starting_price": 127, "low_estimate": 0, "high_estimate": 0, "shipping_details": "", "current_bid": 0, "tags": [ "vbvh" ], "images": [ { "url": "DomainName/Auctions/lots/images/f37d71b5-3179-481b-3c64-f1a71d1072a8/james-dimas-1xvtRcLbLeM-unsplash.jpg", "featured": true } ], "lot_number": 1 }