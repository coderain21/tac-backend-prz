''''This is a paypal connect which is used to connect the paypal account'''
from pymongo import MongoClient
from lib.paypal_helper import get_paypal_access_token,call_paypal_api
import requests
import json
import os
import uuid


# URLs and other constants
PAYPAL_OAUTH_URL = os.environ["PAYPAL_OAUTH_URL"]
PAYPAL_PARTNER_REFERRALS_URL = os.environ["PAYPAL_PARTNER_REFERRALS_URL"]


mongo_client = MongoClient(
    os.environ['MONGO_CLIENT']
)
db = mongo_client[os.environ['DATABASE']]
seller_collection = db[os.environ['SELLERS_TABLE']]

partner_merchant_id = os.environ.get('PAYPAL_PARTNER_MERCHANT_ID')






def create_partner_referral(access_token, tracking_id, return_url):
    """Creates a partner referral with API_INTEGRATION operation in PayPal."""
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {access_token}',
    }
    data = {
        "tracking_id": tracking_id,
        "partner_config_override": {
            "partner_logo_url": "https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_111x69.jpg",
            "return_url": return_url,
            "return_url_description": "the URL to return the merchant after the PayPal onboarding process.",
            # "action_renewal_url": os.environ['DASHBOARD_URL']+os.environ['PAYPAL_REDIRECTION_PATH'],
        },
        "operations": [
            {
                "operation": "API_INTEGRATION",
                "api_integration_preference": {
                    "rest_api_integration": {
                        "integration_method": "PAYPAL",
                        "integration_type": "THIRD_PARTY",
                        "third_party_details": {
                            "features": [
                                "PAYMENT",
                                "REFUND",
                                "ACCESS_MERCHANT_INFORMATION"
                            ]
                        }
                    }
                }
            }
        ],
        "products": [
                "EXPRESS_CHECKOUT"
                    ],
        "legal_consents": [{
                    "type": "SHARE_DATA_CONSENT",
                    "granted": True
                         }]
    }

    response = requests.post(PAYPAL_PARTNER_REFERRALS_URL, headers=headers, json=data)
    if response.status_code != 201:
        raise requests.HTTPError(f"Failed to create partner referral: {response.status_code} - {response.content}")
    return response.json()






def connect(event, context):
    """
    This function is used to connect the seller to paypal.
    It uses the email address from the authorizer to find the user in the database.
    If the user is already connected to paypal, it just queries the database and changes the status.
    If the user is not connected to paypal, it creates a partner referral and redirects the user to paypal to complete the onboarding process.
    """
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'false',
    }
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

        #if the user is already connected to paypal, we are just querying the database and changing the status
        print('user info', user_info)
        if 'paypal_connected_id' in user_info and user_info['paypal_connected_id']:
            access_token = get_paypal_access_token()
            print(f"Access token: {access_token}")

            # Step 2: Check merchant onboarding status
            merchant_id = user_info['paypal_connected_id']  # merchant ID from db
            merchant_status = call_paypal_api(f"/v1/customer/partners/{partner_merchant_id}/merchant-integrations/{merchant_id}", access_token, "GET")
            product_status = any(product.get('name') and product.get('status') == 'ACTIVE'
                         for product in merchant_status.get('products', []))
            print('Merchant status:', merchant_status)

            # Check if payments are receivable and email is confirmed
            payments_receivable = merchant_status.get('payments_receivable', False)
            email_confirmed = merchant_status.get('primary_email_confirmed', False)

            # If all conditions are met, the merchant is considered onboarded
            if product_status and payments_receivable and email_confirmed:
                print('here')
                update_data = {
                    'paypal_status': 'connected'
                }
                connected = seller_collection.update_one({'email_address': email_address}, {'$set': update_data})
                return {
                    'statusCode': 201,
                    'headers': headers,
                    'body': json.dumps({})
                }

        access_token = get_paypal_access_token()
        tracking_id = str(user_info.get('_id'))+str(uuid.uuid4())
        return_url = os.environ['DASHBOARD_URL']+os.environ['PAYPAL_REDIRECTION_PATH']

        referral_response = create_partner_referral(access_token, tracking_id, return_url)
        print('referral_response', referral_response)

        links = referral_response.get('links', [])
        referral_link = None
        if links:
            referral_link = links[1]['href']
            print('referral', referral_link)

            # Update user information in the database
            update_data = {
                "paypal_tracking_id": tracking_id,
                "paypal_status": "pending"
            }
            update_status = seller_collection.update_one({'email_address': email_address}, {'$set': update_data})
            print(f"Database update status: {update_status}")

            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'paypal_url': referral_link
                    # 'tracking_id': tracking_id
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
