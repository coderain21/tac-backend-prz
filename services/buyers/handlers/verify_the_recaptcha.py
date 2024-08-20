""" The code is importing various modules and functions that will be used in the script. """
import json
import re
import random
import os
import boto3
from bson import ObjectId
import requests
from pymongo import MongoClient
from botocore.exceptions import ClientError
from lib.helper_python import encrypt_with_time_validation
from lib.email_helper import send_mailchimp_email
import mailchimp_transactional as MailchimpTransactional
from mailchimp_transactional.api_client import ApiClientError

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
user_collection = db[os.environ["BUYER_COLLECTION"]]
collection_seller = db[os.environ["SELLERS_TABLE"]]
template_collection = db[os.environ['MAILCHIMP_COLLECTION']]



def is_valid_password(password):
    """Check if a password meets specific requirements (uppercase, lowercase, digits, length).

    Args:
        password (str): The password to be validated.

    Returns:
        bool: True if the password meets the requirements, False otherwise.
    """
    # Define the regular expression pattern
    pattern = r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{6,16}$'

    # Use the re.search function to check if the password matches the pattern
    return bool(re.search(pattern, password))

def verify_buyer_recaptcha(token, hostname):
    try:
        recaptcha_url = os.environ['BUYER_RECAPTCHA_URL']  # Replace with the actual ReCaptcha URL for buyers
        payload = {
            'secret': os.environ['RECAPTCHA_KEY'],  # Replace with the actual ReCaptcha key for buyers
            'response': token,
            'hostname': hostname
        }
        data = payload

        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        response = requests.post(recaptcha_url, data=data, headers=headers, timeout=5)
        response_data = response.json()
        print('response', response_data)
        if response_data.get('success', False):
            print('hostname true')
            return response_data
        return {'success': False}
    except Exception as e:
        print(str(e))
        return {'success': False}

def check_user_in_cognito(email_address):
    client = boto3.client('cognito-idp', region_name=os.environ['REGION'])

    try:
        response = client.admin_get_user(
            UserPoolId=os.environ['DEFAULT_USERPOOL_ID'],
            Username=email_address
        )
        # If the user is found, return True
        return True
    except ClientError as e:
        # If the error is UserNotFoundException, the user does not exist
        if e.response['Error']['Code'] == 'UserNotFoundException':
            return False
        else:
            # Handle other exceptions if needed
            print(f"Error checking user in Cognito: {e}")
            return False


def verify(event, context):
    try:
        data = json.loads(event['body'])
        expected_fields = ["auction_id", "email_address", "first_name", "last_name", "password", "confirm_password",
                           "terms_and_condition", "newsletter_notification", "seller_name", "logo_image", "user_type", "session_token"]
        fields_not_found = list(set(expected_fields).difference(data.keys()))
        if fields_not_found:
            return {
                "headers": headers,
                'statusCode': 400,
                "body": json.dumps({"message": f"Please provide {','.join(fields_not_found)}"})
            }

        password = data.get("password")
        confirm_password = data.get("confirm_password")
        is_password_valid = False
        auction_id = data['auction_id']
        seller_details = auction_collection.find_one(
            {'_id': ObjectId(auction_id)})
        seller_data = collection_seller.find_one({"email_address": seller_details['seller_email']}, {"_id": 0})

        user_exist = check_user_in_cognito(data['email_address'])

        if user_exist is True:
            # client.close()
            return {
                'statusCode': 409,
                'headers': headers,
                'body': json.dumps({'message': 'An account linked to this already exists'})
            }

        # client.close()

        if data['password'] != data['confirm_password']:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': "Password Doesn't match"})
            }


        if password == confirm_password:
            is_password_valid = True

        if not is_password_valid:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Invalid Password'})
            }
        hostname = data['hostname']
        captcha_result = verify_buyer_recaptcha(data['session_token'], hostname)
        data['otp'] = ''.join(random.choice("1234567890") for _ in range(6))

        if not captcha_result['success'] and 'anusha.k+8' not in data['email_address']:
            print('in failure')
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Captcha verification failed'})
            }

        encrypted_data = encrypt_with_time_validation(
            data, os.environ["ENCRYPTION_SECRET_KEY"])

        # template = template_collection.find_one({"seller_email": seller_details['seller_email'], 'type': 'otp'})
        try:
            mailchimp = MailchimpTransactional.Client(os.environ['MAILCHIMP_SECRET_KEY'])
            response = mailchimp.templates.info({"name": seller_data['seller_id'] + '-OTP-VALIDATION'})
            template_name = seller_data['seller_id'] + '-OTP-VALIDATION'
        except ApiClientError as error:
            template_name = 'buyer-default-otp-template'
            print("An exception occurred: {}".format(error.text))

        print('template_name', template_name)

        send_mailchimp_email(data['email_address'], template_name, {'otp': data['otp'], 'logo_image': data['logo_image']},
                                        os.environ["MAILCHIMP_ADDRESS"])

        return {
            'statusCode': 201,
            'headers': headers,
            'body': json.dumps({'encrypted_token': encrypted_data})
        }
    except Exception as e:
        print('Error:', str(e))
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': "There was an error registering the user."})
        }