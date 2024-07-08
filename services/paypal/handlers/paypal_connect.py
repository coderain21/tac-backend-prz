import base64
from datetime import datetime
from pymongo import MongoClient
import requests
import json
import os


headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

# Environment variables for sensitive data
CLIENT_ID = 'AcRKzvjgOiDpoecavRoQkat26s6EK_prJcvmH9w8DIpOZ5QqqIrf7oOkhF-Dl3i9C4qZXHYENLtxIVJO'                         #os.getenv("PAYPAL_CLIENT_ID")
CLIENT_SECRET = 'EETqZretSNiyj5DOt26Bcr5_rLKqC8UImFnId-Qi0ArXaKMAHmH30ElBDeRvtTQzzRcXSr8Oa-JPEjdv'                     #os.getenv("PAYPAL_CLIENT_SECRET")

# URLs and other constants
PAYPAL_OAUTH_URL = "https://api-m.sandbox.paypal.com/v1/oauth2/token"
PAYPAL_PARTNER_REFERRALS_URL = "https://api-m.sandbox.paypal.com/v2/customer/partner-referrals"


mongo_client = MongoClient(
                      os.environ['MONGO_CLIENT']
                    #   maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = mongo_client[os.environ['DATABASE']]
seller_collection = db[os.environ['SELLERS_TABLE']]

def get_paypal_access_token():
    """Gets a PayPal access token."""
    headers = {
        "Authorization": "Basic " + base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode("utf-8")).decode("utf-8"),
        "Content-Type": "application/x-www-form-urlencoded",
    }
    payload = {"grant_type": "client_credentials"}
    response = requests.post(PAYPAL_OAUTH_URL, headers=headers, data=payload)

    if response.status_code != 200:
        raise Exception(f"Failed to get PayPal access token: {response.content}")

    response_json = response.json()
    return response_json["access_token"]

def create_partner_referral(access_token, tracking_id, return_url):
    """Creates a partner referral in PayPal."""
    data = {
        "tracking_id": tracking_id,
        "partner_config_override": {
            "partner_logo_url": "https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_111x69.jpg",
            "return_url": return_url,
            "return_url_description": "the URL to return the merchant after the PayPal onboarding process.",
            "action_renewal_url": "https://testenterprises.com/renew-expired-url",
            "show_add_credit_card": True
        },
        "operations": [{"operation": "BANK_ADDITION"}],
        "legal_consents": [{"type": "SHARE_DATA_CONSENT", "granted": True}],
        "products": ["EXPRESS_CHECKOUT"]
    }
    response = requests.post(PAYPAL_PARTNER_REFERRALS_URL, headers=headers, data=json.dumps(data))
    return response.json()

def connect(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
        except:
            return {
                "headers": headers,
                "statusCode": 403,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        user_info = seller_collection.find_one({"email_address": email_address})

        # Restricting free tier users from connecting to PayPal
        if "plan_type" in user_info and user_info.get("plan_type") == "Free":
            print("free_user")
            return {
                "headers": headers,
                "statusCode": 403,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        access_token = get_paypal_access_token()
        tracking_id = f"indy_{email_address}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        return_url = 'https://seller.dev.indyauction.net/'

        referral_response = create_partner_referral(access_token, tracking_id, return_url)

        links = referral_response.get('links', [])
        if links:
            referral_link = links[1]['href']
            print('referral', referral_link)

            # Update user information in the database
            update_data = {
                "paypal_tracking_id": tracking_id,
                "paypal_status": "pending"
            }
            update_status = seller_collection.update_one({'email_address':email_address}, {'$set': update_data})
            print(f"Database update status: {update_status}")

            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'paypal_url': referral_link,
                    'tracking_id': tracking_id
                })
            }

        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': 'Referral link not found in the response'
            })
        }

    except Exception as e:
        print('Error', e)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e)})
        }