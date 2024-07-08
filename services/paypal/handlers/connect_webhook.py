import json
import os
import decimal
from pymongo import MongoClient
from datetime import datetime
from paypalrestsdk import WebhookEvent

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

def create(event, context):
    try:
        event_body = json.loads(event["body"])
        webhook_id = os.environ["PAYPAL_WEBHOOK_ID"]
        transmission_id = event["headers"]["Paypal-Transmission-Id"]
        transmission_time = event["headers"]["Paypal-Transmission-Time"]
        cert_url = event["headers"]["Paypal-Cert-Url"]
        auth_algo = event["headers"]["Paypal-Auth-Algo"]
        transmission_sig = event["headers"]["Paypal-Transmission-Sig"]
        webhook_event = event_body

        # Verify the webhook event
        response = WebhookEvent.verify(
            transmission_id=transmission_id,
            timestamp=transmission_time,
            webhook_id=webhook_id,
            event_body=json.dumps(webhook_event),
            cert_url=cert_url,
            actual_sig=transmission_sig,
            auth_algo=auth_algo
        )

        if response:
            data = webhook_event["resource"]
            verified = False
            account_linked = 0
            # MongoDB configuration
            client = MongoClient(os.environ['MONGO_CLIENT'])
            db = client[os.environ['DATABASE']]
            collection = db[os.environ['SELLERS_TABLE']]

            if webhook_event["event_type"] == "MERCHANT.ACCOUNT.UPDATED":
                paypal_id = data["merchant_id"]
                if data["status"] == "ACTIVE":
                    verified = True
                    account_linked += 1

                query_result = collection.find_one(
                    {'paypal_connected_id': paypal_id}, {'password': 0})
                if query_result is not None:
                    update_data = {
                        "paypal_status": "connected" if verified else "disconnected",
                        "account_linked": account_linked
                    }
                    update_result = collection.update_one(
                        {'paypal_connected_id': paypal_id}, {'$set': update_data})
                else:
                # No existing document found, insert a new document
                    new_document = {
                            "paypal_connected_id": paypal_id,
                            "paypal_status": "connected" if verified else "disconnected",
                            "account_linked": account_linked
                    # You might include other relevant fields here
                            }
                    insert_result = collection.insert_one(new_document)

            client.close()
            return {
                "headers": headers,
                'statusCode': 204,
                'body': json.dumps({}, cls=Encoder)
            }
        else:
            return {
                "headers": headers,
                "statusCode": 400,
                "body": json.dumps({"message": "Invalid Webhook Event"})
            }

    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error processing the webhook"})
        }
