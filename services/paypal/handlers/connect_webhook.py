'''This module is used as webhook for the paypal connect'''
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

client_id = os.environ.get('PAYPAL_CLIENT_ID')
client_secret = os.environ.get('PAYPAL_CLIENT_SECRET')
partner_merchant_id = os.environ.get('PAYPAL_PARTNER_MERCHANT_ID')
paypal_url = os.environ.get('PAYPAL_URL')


def verify_webhook(event):
    """
    Verify that the given webhook event is a valid PayPal webhook event.

    Extracts the required fields from the event, and uses them to verify
    the webhook event against the PayPal webhook identified by the
    PAYPAL_WEBHOOK_ID environment variable.

    :param event: The webhook event to verify, as a dict-like object
                  containing the following keys:
                      - headers: A dict-like object containing the
                        following keys:
                          - PAYPAL-TRANSMISSION-ID
                          - PAYPAL-TRANSMISSION-TIME
                          - PAYPAL-CERT-URL
                          - PAYPAL-TRANSMISSION-SIG
                          - PAYPAL-AUTH-ALGO
                      - body: The JSON-decoded body of the webhook event
    :return: True if the webhook event is valid, False otherwise.
    """
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
    """
    Get a PayPal access token.

    Makes a request to the PayPal OAuth2 token endpoint, using the
    client ID and secret from the environment variables, and returns
    the access token received in response.

    :return: The access token, as a string.
    """
    paypal_api_base = paypal_url   #"https://api-m.sandbox.paypal.com"  # Use the production URL for live environment

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
    """
    Makes a call to the PayPal API at the given endpoint.

    Args:
        endpoint: The API endpoint to call.
        method: The HTTP method to use (default is GET).

    Returns:
        The JSON-decoded response from the API, or an empty dictionary if there was an error.
    """
    paypal_api_base = paypal_url   #"https://api-m.sandbox.paypal.com"  # Use the production URL for live environment
    headers = {
        "Authorization": f"Bearer {get_paypal_access_token()}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.request(method, f"{paypal_api_base}{endpoint}", headers=headers)
        print('response in call api', response.json())
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error calling PayPal API: {e}")
        return {}
    







def get_paypal_id(tracking_id):
    """
    Given a tracking_id, return the associated paypal merchant id
    using the PayPal Partners API.
    """
    
    PAYPAL_URL = paypal_url   #"https://api-m.sandbox.paypal.com"

    url = f"{PAYPAL_URL}/v1/customer/partners/{partner_merchant_id}/merchant-integrations?tracking_id={tracking_id}"
    access_token = get_paypal_access_token()
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {access_token}'
    }
    
    response = requests.get(url, headers=headers)
    print('response', response.json())
    return response['merchant_id']



def update_or_create_merchant(collection, data, event_type):
    tracking_id = data.get("tracking_id")
    merchant_id = data.get("merchant_id")
    
    print(f"Processing event: {event_type}")
    print(f"Tracking ID: {tracking_id}")
    print(f"Merchant ID: {merchant_id}")
    
    # Try to find the document by tracking_id first
    existing_doc = collection.find_one({"paypal_tracking_id": tracking_id})
    
    if not existing_doc and merchant_id:
        # If not found by tracking_id, try to find by merchant_id
        existing_doc = collection.find_one({"paypal_connected_id": merchant_id})
    
    update_data = {
        "$set": {
            "paypal_tracking_id": tracking_id,
            "paypal_connected_id": merchant_id,
            "last_updated": datetime.now(),
        }
    }
    
    if event_type == "CUSTOMER.MERCHANT-INTEGRATION.SELLER-ONBOARDING-STARTED":
        update_data["$set"]["paypal_status"] = "pending"
        update_data["$set"]["paypal_onboarding_started"] = datetime.now()
    elif event_type == "CUSTOMER.MERCHANT-INTEGRATION.SELLER-CONSENT-GRANTED":
        update_data["$set"]["paypal_status"] = "consent_granted"
        if merchant_id:
            merchant_info = call_paypal_api(f"/v1/customer/partners/{partner_merchant_id}/merchant-integrations/{merchant_id}")
            update_data["$set"]["paypal_capabilities"] = merchant_info.get('capabilities', [])
            update_data["$set"]["paypal_products"] = merchant_info.get('products', [])

             # Check if payments_receivable is True and primary_email is confirmed
            payments_receivable = merchant_info.get('payments_receivable', False)
            primary_email_confirmed = merchant_info.get('primary_email_confirmed', False)

            if payments_receivable and primary_email_confirmed:
                # Merchant is fully onboarded
                update_data["$set"]["paypal_status"] = "connected"
            else:
                # If not fully onboarded, capture incomplete status
                update_data["$set"]["paypal_status"] = "consent_granted"




    elif event_type == "MERCHANT.ONBOARDING.COMPLETED":
        update_data["$set"]["paypal_status"] = "connected"
        update_data["$set"]["paypal_onboarding_completed"] = datetime.now()
    
    if existing_doc:
        result = collection.update_one({"_id": existing_doc["_id"]}, update_data)
        print(f"Updated merchant document. Modified: {result.modified_count}")
        if existing_doc.get("paypal_connected_id") != merchant_id:
            print(f"Merchant ID changed from {existing_doc.get('paypal_connected_id')} to {merchant_id}")
    else:
        result = collection.insert_one(update_data["$set"])
        print(f"Created new merchant document. Inserted ID: {result.inserted_id}")
    
    return result

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
            event_type = webhook_event["event_type"]
            resource = webhook_event["resource"]
            
            if event_type in [
                "CUSTOMER.MERCHANT-INTEGRATION.SELLER-ONBOARDING-STARTED",
                "CUSTOMER.MERCHANT-INTEGRATION.SELLER-CONSENT-GRANTED",
                "MERCHANT.ONBOARDING.COMPLETED"
            ]:
                update_or_create_merchant(collection, resource, event_type)
            else:
                print(f"Unhandled event type: {event_type}")

        except Exception as err:
            print(f"Error processing webhook: {str(err)}")
            return {
                "headers": headers,
                "statusCode": 500,
                "body": json.dumps({"message": "There was an error processing the webhook"})
            }
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