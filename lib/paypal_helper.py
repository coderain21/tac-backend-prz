import os
import base64
from paypalrestsdk import WebhookEvent
import requests


client_id = os.environ.get('PAYPAL_CLIENT_ID')
client_secret = os.environ.get('PAYPAL_CLIENT_SECRET')
paypal_url = os.environ.get('PAYPAL_URL')
partner_merchant_id = os.environ.get('PAYPAL_PARTNER_MERCHANT_ID')



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



def call_paypal_api(endpoint, access_token, method='GET'):
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
        "Authorization": f"Bearer {access_token}",
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