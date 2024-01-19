import base64
import requests
import json
from urllib.parse import urlparse, parse_qs


# Replace with your PayPal client ID and secret
client_id = "AcRKzvjgOiDpoecavRoQkat26s6EK_prJcvmH9w8DIpOZ5QqqIrf7oOkhF-Dl3i9C4qZXHYENLtxIVJO"
client_secret = "EETqZretSNiyj5DOt26Bcr5_rLKqC8UImFnId-Qi0ArXaKMAHmH30ElBDeRvtTQzzRcXSr8Oa-JPEjdv"
CLIENT_ID = client_id
CLIENT_SECRET = client_secret
# Step 2: Create PayPal Seller Account Link
seller_onboarding_url = 'https://api.paypal.com/v2/customer/partner-referrals'
seller_onboarding_data = {
    'product_id': 'PAYPAL_PARTNER_ID',
    'customer_data': {
        'email_address': 'shrinit.poojary@7edge.com',
        # Add other seller information as needed
    }
}
def get_paypal_access_token(client_id, client_secret):
    """Gets a PayPal access token."""
    url = "https://api-m.sandbox.paypal.com/v1/oauth2/token"
    headers = {
        "Authorization": "Basic " + base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("utf-8"),
        "Content-Type": "application/x-www-form-urlencoded",
    }
    payload = {
        "grant_type": "client_credentials",
    }
    response = requests.post(url, headers=headers, data=payload)

    if response.status_code != 200:
        raise Exception(f"Failed to get PayPal access token: {response.content}")

    response_json = response.json()
    print(response_json)
    print()
    return response_json["access_token"]
    # print(f'Seller Account Link: {seller_account_link}')
access_token = get_paypal_access_token(client_id, client_secret)


# def create_user(access_token):
#     headers = {
#         'Content-Type': 'application/scim+json',
#         'Authorization': f'Bearer {access_token}',
#     }

#     data = {
#         "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
#         "userName": "shrin1222",
#         "name": {
#             "givenName": "shrinit",
#             "familyName": "McLaughlin"
#         },
#         "emails": [
#             {
#                 "value": "shrinit.poojary+11@7edge.com",
#                 "type": "work",
#                 "primary": True
#             }
#         ],
#         "password": "Simba@18",  # Add a password for the user
#         "active": True  # Set the user as active
#     }

#     # Convert the dictionary to JSON string before sending
#     data_json = json.dumps(data)

#     response = requests.post('https://api-m.sandbox.paypal.com/v2/scim/Users', headers=headers, data=data_json)
#     print(response.json())
#     print()
#     return response.json()


# # create_user(access_token,user_name,first_name,last_name,email_address)

# def update_user(access_token,id):
#     headers = {
#         'Content-Type': 'application/scim+json',
#         'Authorization': f'Bearer {access_token}',
#     }

#     data = '{ "schemas": [ "urn:ietf:params:scim:schemas:core:2.0:User" ], "userName": "sydneyml531", "name": { "givenName": "Sydney", "familyName": "McLaughlin" }, "emails": [ { "value": "sydneyml@shop.com", "primary": true } ] }'
#     response = requests.patch('https://api-m.sandbox.paypal.com/v2/scim/Users/7XRNGHV24HQL4', headers=headers, data=data)
#     return response.json()
# # update_user(access_token,id)
def create_partner_referral(access_token):

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {access_token}',
    }

    data = '{"email":"sb-ckybs27026226@business.example.com","preferred_language_code": "en-US","tracking_id":"indy123123","partner_config_override":{"partner_logo_url":"https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_111x69.jpg","return_url":"https://seller-dev.indyauction.net/","return_url_description":"the url to return the merchant after the paypal onboarding process.","action_renewal_url":"https://testenterprises.com/renew-exprired-url","show_add_credit_card":true},"legal_consents":[{"type":"SHARE_DATA_CONSENT","granted":true}],"operations":[{"operation":"API_INTEGRATION","api_integration_preference":{"rest_api_integration":{"integration_method":"PAYPAL","integration_type":"THIRD_PARTY","third_party_details":{"features":["PAYMENT","REFUND"]}}}}], "products":["EXPRESS_CHECKOUT"]}'

    response = requests.post('https://api-m.sandbox.paypal.com/v2/customer/partner-referrals', headers=headers, data=data)
    return response.json()

def referral_data(partner_id,access_token):
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {access_token}',
    }
    print(partner_id)
    print()
    response = requests.get(f'https://api-m.sandbox.paypal.com/v2/customer/partner-referrals/{partner_id}', headers=headers)
    return response.json()
user = create_partner_referral(access_token)
print(user,"\n")
links= user['links']
url=links[1]['href']
parsed_url = urlparse(url)
query_parameters = parse_qs(parsed_url.query)
referral_token = query_parameters.get('referralToken')
print(referral_token)
referral=referral_data(referral_token[0],access_token)
print(referral)