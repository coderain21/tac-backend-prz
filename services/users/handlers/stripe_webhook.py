"""
This module is used as webhook for the stripe platform
"""
import json
import os
import stripe
import decimal
from pymongo import MongoClient
from datetime import datetime

stripe.api_key = os.environ["STRIPE_API_KEY"]

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': False,
}

class Encoder(json.JSONEncoder):
    """
    Custom JSON Encoder to handle special types.

    Handles encoding of Decimal, bytes, and datetime objects.
    """

    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return str(o)
        if isinstance(o, bytes):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)


def create(event,context):
    try:
        event_body = json.loads(event["body"])
        data = event_body.get("data")
        verified = False
        account_linked = 0
        # MongoDB configuration
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ['SELLERS_TABLE']]

        if data["object"]["object"] == "account":
            stripe_id = data["object"]["id"]
            if data["object"]["charges_enabled"] == True and data["object"]["details_submitted"] == True and data["object"]["payouts_enabled"] == True:
                verified = True
                account_linked = 1
                
            query_result = collection.find_one({'stripe_connected_id': stripe_id},{'password':0})
            if query_result is not None:
                update_data = {
                    "stripe_status" : "connected" if verified == True else "disconnected",
                    "account_linked" : account_linked
                }
                print(update_data)
                update_result = collection.update_one(
                    {'stripe_connected_id': stripe_id}, {'$set': update_data})
            
        client.close()
        return {
            "headers": headers,
            'statusCode': 204,
            'body': json.dumps({
                
            },
                cls=Encoder)
        }

    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error while generating token"})
        }