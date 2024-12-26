'''This module is used as webhook for the paypal connect'''
import json
import os
import decimal
from pymongo import MongoClient
from datetime import datetime
from lib.paypal_helper import get_paypal_access_token, call_paypal_api, verify_webhook

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


partner_merchant_id = os.environ.get('PAYPAL_PARTNER_MERCHANT_ID')


def update_or_create_merchant(collection, data, event_type):
    tracking_id = data.get("tracking_id")
    merchant_id = data.get("merchant_id")
    link = data['links'][0]['href']
    print('link', link)
    print(f"Processing event: {event_type}")
    print(f"Tracking ID: {tracking_id}")
    print(f"Merchant ID: {merchant_id}")

    access_token = get_paypal_access_token()

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

    if event_type in ["CUSTOMER.MERCHANT-INTEGRATION.SELLER-ONBOARDING-STARTED","CUSTOMER.MERCHANT-INTEGRATION.SELLER-ONBOARDING-INITIATED"]:
        update_data["$set"]["paypal_onboarding_started"] = datetime.now()
        if merchant_id:
            # Call PayPal API to get merchant info
            access_token = get_paypal_access_token()
            merchant_info = call_paypal_api(f"/v1/customer/partners/{partner_merchant_id}/merchant-integrations/{merchant_id}", access_token, "GET")
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
        else:
            update_data["$set"]["paypal_status"] = "pending"



    elif event_type == "CUSTOMER.MERCHANT-INTEGRATION.SELLER-CONSENT-GRANTED":
        update_data["$set"]["paypal_status"] = "consent_granted"
        if merchant_id:
            # Call PayPal API to get merchant info
            access_token = get_paypal_access_token()
            merchant_info = call_paypal_api(f"/v1/customer/partners/{partner_merchant_id}/merchant-integrations/{merchant_id}", access_token, "GET")
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
        return{
            "headers": headers,
            "statusCode": 404,
            "body": json.dumps({"message": "Merchant not found"})
        }

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
            print('resource', resource)

            if event_type in [
                "CUSTOMER.MERCHANT-INTEGRATION.SELLER-ONBOARDING-STARTED",
                "CUSTOMER.MERCHANT-INTEGRATION.SELLER-ONBOARDING-INITIATED",
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