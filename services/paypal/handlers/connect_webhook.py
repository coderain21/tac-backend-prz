import json
import os
import decimal
import base64
from pymongo import MongoClient
from datetime import datetime
from paypalrestsdk import WebhookEvent
import requests

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

class Encoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, (decimal.Decimal, bytes)):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)

def get_mongodb_connection():
    client = MongoClient(os.environ['MONGO_CLIENT'])
    db = client[os.environ['DATABASE']]
    return client, db[os.environ['SELLERS_TABLE']]

def verify_webhook(event):
    webhook_id = os.environ["PAYPAL_WEBHOOK_ID"]
    headers = event["headers"]
    
    return WebhookEvent.verify(
        transmission_id=headers["PAYPAL-TRANSMISSION-ID"],
        timestamp=headers["PAYPAL-TRANSMISSION-TIME"],
        webhook_id=webhook_id,
        event_body=event["body"],
        cert_url=headers["PAYPAL-CERT-URL"],
        actual_sig=headers["PAYPAL-TRANSMISSION-SIG"],
        auth_algo=headers["PAYPAL-AUTH-ALGO"]
    )

def get_paypal_access_token():
    client_id = os.environ.get('PAYPAL_CLIENT_ID')
    client_secret = os.environ.get('PAYPAL_CLIENT_SECRET')
    paypal_api_base = "https://api-m.sandbox.paypal.com"  # Use the production URL for live environment
    
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    headers = {
        "Authorization": f"Basic {auth}"
    }
    data = {
        "grant_type": "client_credentials"
    }
    response = requests.post(f"{paypal_api_base}/v1/oauth2/token", headers=headers, data=data)
    response.raise_for_status()
    return response.json()["access_token"]

def call_paypal_api(endpoint, method='GET'):
    paypal_api_base = "https://api-m.sandbox.paypal.com"  # Use the production URL for live environment
    headers = {
        "Authorization": f"Bearer {get_paypal_access_token()}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.request(method, f"{paypal_api_base}{endpoint}", headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error calling PayPal API: {e}")
        return {}

def handle_onboarding_event(collection, data, event_type):
    paypal_id = data.get("merchant_id")
    tracking_id = data.get("tracking_id")
    
    # Get merchant's onboarding status
    if paypal_id:
        onboarding_status = call_paypal_api(f"/v1/customer/partners/S2DT3GS2RAWHL/merchant-integrations/{paypal_id}")
        
        update_data = {
            "$set": {
                "paypal_connected_id": paypal_id,
                "paypal_status": 'connected',
                "paypal_capabilities": onboarding_status.get('capabilities', []),
                "paypal_products": onboarding_status.get('products', []),
                "paypal_onboarding_completed": datetime.now() if "COMPLETED" in event_type else None,
                "paypal_onboarding_started": datetime.now() if "STARTED" in event_type else None,
            }
        }
    else:
        update_data = {
            "$set": {
                "paypal_status": "pending",
                "paypal_onboarding_started": datetime.now() if "STARTED" in event_type else None,
            }
        }
    
    result = collection.update_one({'paypal_tracking_id': tracking_id}, update_data)
    print(f"Merchant onboarding {event_type} for PayPal ID: {paypal_id}. Modified: {result.modified_count}")

def handle_status_change_event(collection, data):
    paypal_id = data.get("merchant_id")
    status = data.get("status", "UNKNOWN")
    
    query_result = collection.find_one({'paypal_connected_id': paypal_id})
    if query_result:
        update_data = {
            "$set": {
                "paypal_status": "connected" if status == "ACTIVE" else "disconnected",
                "last_updated": datetime.now(),
            }
        }
        result = collection.update_one({'paypal_connected_id': paypal_id}, update_data)
        print(f"Updated merchant status for PayPal ID: {paypal_id}. Modified: {result.modified_count}")
    else:
        print(f"Warning: No user found with PayPal ID: {paypal_id} for status update")

def create(event, context):
    try:
        if not verify_webhook(event):
            return {
                "headers": headers,
                "statusCode": 400,
                "body": json.dumps({"message": "Invalid Webhook Event"})
            }

        webhook_event = json.loads(event["body"])
        print(f"Received event: {webhook_event['event_type']}")

        client, collection = get_mongodb_connection()

        try:
            if webhook_event["event_type"] in [
                "CUSTOMER.MERCHANT-INTEGRATION.SELLER-ONBOARDING-STARTED", 
                "CUSTOMER.MERCHANT-INTEGRATION.SELLER-ONBOARDING-COMPLETED", 
                "CUSTOMER.MERCHANT-INTEGRATION.SELLER-ONBOARDING-INITIATED",
                "MERCHANT.ONBOARDING.COMPLETED",
                "CUSTOMER.MERCHANT-INTEGRATION.COMPLETED"
            ]:
                handle_onboarding_event(collection, webhook_event["resource"], webhook_event["event_type"])
            elif webhook_event["event_type"] == "CUSTOMER.MERCHANT-INTEGRATION.SELLER-STATUS-CHANGE":
                handle_status_change_event(collection, webhook_event["resource"])
            else:
                print(f"Unhandled event type: {webhook_event['event_type']}")
        finally:
            client.close()

        return {
            "headers": headers,
            'statusCode': 204,
            'body': json.dumps({}, cls=Encoder)
        }

    except Exception as err:
        print(f"Error processing webhook: {str(err)}")
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error processing the webhook"})
        }