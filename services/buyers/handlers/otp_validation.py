import json
import os
import time
import boto3
from pymongo import MongoClient

from lib.helper_python import decrypt_with_time_validation

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


cognito_client = boto3.client('cognito-idp', region_name=os.environ['REGION'])

def admin_create_user(userData,userpool_id):
    try:
        attribute_list = [
            {'Name': 'email', 'Value': userData['email_address']}
        ]

        admin_create_user_params = {
            'UserPoolId': userpool_id,
            'Username': userData['email_address'],
            'UserAttributes': attribute_list,
            'MessageAction': 'SUPPRESS'
        }

        user = cognito_client.admin_create_user(**admin_create_user_params)

        password_params = {
            'UserPoolId': userpool_id,
            'Username': userData['email_address'],
            'Password': userData['password'],
            'Permanent': True
        }
        cognito_client.admin_set_user_password(**password_params)

        if user:
            cognito_client.admin_add_user_to_group(
                GroupName=userData['user_type'],
                UserPoolId=userpool_id,
                Username=userData['email_address']
            )

            return {
                'success_status': True,
                'message': 'User added successfully'
            }
        else:
            return {
                'success_status': False,
                'message': 'There was an error while creating the admin account'
            }
    except Exception as e:
        print(e)
        return {
            'success_status': False,
            'message': str(e)
        }

def validate(event, context):
    try:
        data = json.loads(event['body'])

        encrypted_token = data.get('session_token')
        otp = data.get('otp')
        domain = data.get('domain')

        if not encrypted_token or not otp:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Invalid request'})
            }

        secret_key = os.environ["ENCRYPTION_SECRET_KEY"]
        decrypted_data = decrypt_with_time_validation(encrypted_token, secret_key)
        timestamp = decrypted_data["time_stamp"]
        if timestamp is None or decrypted_data is None:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Invalid session token'})
            }

        current_time = int(time.time())
        max_age = 600  # 10 minutes in seconds

        if current_time - timestamp > max_age:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({'message': 'Session token expired'})
            }

        if int(decrypted_data.get('otp')) != otp:
        
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Invalid OTP',
                                    'decrypted_dtaa':decrypted_data})
            }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        user_pools_collection = db[os.environ["USERPOOLS_MONGO"]]
        userpool_id = user_pools_collection.find_one({"sub_domain_name":domain},{"user_pool_id":1})
        # Your code to create the user in Cognito
        response = admin_create_user(decrypted_data,userpool_id["user_pool_id"])

        if response:
            # Your code to store the decrypted token data in MongoDB
            
            collection = db[os.environ["BUYER_COLLECTION"]]
            
            collection.insert_one(decrypted_data)
            client.close()

            return {
                'statusCode': 201,
                'headers': headers,
                'body': json.dumps({'message': 'User created'})
            }
        else:
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'message': "Error creating the user in Cognito"})
            }

    except Exception as e:
        print(e)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': "There was an error creating the user."})
        }
