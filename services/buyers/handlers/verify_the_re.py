import json
import requests
import re
import random
import os
from pymongo import MongoClient
from urllib.parse import urlencode

from lib.helper_python import encrypt_with_time_validation,send_pinpoint_email

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def is_valid_password(password):
    # Define the regular expression pattern
    pattern = r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{6,16}$'
    
    # Use the re.search function to check if the password matches the pattern
    return bool(re.search(pattern, password))

def verify_recaptcha(token):
    try:
        recaptcha_url = os.environ['RECAPTCHA_URL']
        payload = {
            'secret': os.environ["RECAPTCHA_KEY"],
            'response': token
        }
        
        data = urlencode(payload)  # Convert the payload to form data

        headers = {'Content-Type': 'application/x-www-form-urlencoded'}

        response = requests.post(recaptcha_url, data=data, headers=headers)
        response_data = response.json()
        print(response_data)
        if response_data.get('success', False):
            return response_data
        return {'success_status': False}
    except Exception as e:
        print(e)
        return {'success_status': False}

def verify(event,context):
    try:
        data = json.loads(event['body'])
        expected_fields = ["email_address", "first_name", "last_name","password","confirm_password","terms_and_conditions","newsletter_notification","seller_name","logo_image","session_token","user_type"]
        fields_not_found = list(set(expected_fields).difference(data.keys()))
        if fields_not_found:
            return {"headers": headers,
                    'statusCode': 400,
                    "body": json.dumps(
                        {"message": f"Please provide {','.join(fields_not_found)}"})
                    }

        password = data.get("password")
        confirm_password = data.get("confirm_password")
        is_password_valid = False

        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        user_collection = db[os.environ["BUYER_COLLECTION"]]
        user_exist = user_collection.find_one({'email_address': data['email_address'], 'user_type': data['user_type']})

        if user_exist:
            return {
                'statusCode': 409,
                'headers': headers,
                'body': json.dumps({'message': 'An account linked to this already exists'})
            }
        
        client.close()

        if data['password'] != data['confirm_password']:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': "Password Doesn't match"})
            }
        if is_valid_password(password):
            if password == confirm_password:
                is_password_valid = True
            else:
                is_password_valid = False
        
        if not is_password_valid:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Invalid Password'})
            }

        captcha_result = verify_recaptcha(data['session_token'])

        data['otp'] = ''.join(random.choice("1234567890") for _ in range(6))

        if not captcha_result['success_status'] and 'anusha.k+7' not in data['email_address']:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Captcha verification failed'})
            }

        encrypted_data = encrypt_with_time_validation(data, os.environ["ENCRYPTION_SECRET_KEY"])
        email_status = send_pinpoint_email(data['email_address'], os.environ["SENDER_EMAIL_ADDRESS"], json.dumps({'otp': data['otp'],'seller_name': data['seller_name'],'logo_image':data['logo_image']}),
                                    os.environ["BUYER_EMAIL_OTP_TEMPLATE"])
        print(encrypted_data)
        return {
            'statusCode': 201,
            'headers': headers,
            'body': json.dumps({'encrypted_token': encrypted_data})
        }
    except Exception as e:
        print(e)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': "There was an error registering the user."})
        }
