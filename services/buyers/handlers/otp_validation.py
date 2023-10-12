"""This module contains a set of functions for user validation and creation in a serverless application. It utilizes Amazon Cognito for user management and MongoDB for data storage.

Module Functions:
- admin_create_user(userData, userpool_id): Create a new user in Amazon Cognito and add them to a Cognito User Group.
- hash_password(password): Generate a salt and hash the given password using bcrypt.
- validate(event, context): Validate user session tokens, create new Cognito users, and store user data in MongoDB.

Please note that the code in this module is designed for use within a serverless environment and relies on various environment variables for configuration and secrets.

The code's primary functionality involves user registration and validation by decrypting session tokens, creating Cognito users, and storing user data in a MongoDB database.
"""
import json
import os
import time
import boto3
import bcrypt
from pymongo import MongoClient

from lib.helper_python import decrypt_with_time_validation

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def hash_password(password):
    """Generate a salt and hash the provided password using bcrypt.

    Args:
        password (str): The plaintext password to hash.

    Returns:
        str: The hashed password as a UTF-8 encoded string.
    """
    # Generate a salt and hash the password
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed_password.decode('utf-8')


cognito_client = boto3.client('cognito-idp', region_name=os.environ['REGION'])


def admin_create_user(userData, userpool_id):
    """Create a new user in Amazon Cognito and add them to a Cognito User Group.

    Args:
        userData (dict): User data, including email address and user type.
        userpool_id (str): The ID of the Cognito User Pool.

    Returns:
        dict: A response indicating whether the user was created successfully or if there was an error.
            - 'success_status' (bool): True if the user was created, False otherwise.
            - 'message' (str): A message describing the result of the operation.
    """
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

        # Attempt to create the user
        user = cognito_client.admin_create_user(**admin_create_user_params)

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
    """Validate user session tokens, create new Cognito users, and store user data in MongoDB.

    Args:
        event (dict): The event data containing the user's session token, OTP, and domain.
        context: The AWS Lambda context object (not used in this function).

    Returns:
        dict: A response indicating the outcome of the validation and user creation process.
            The response may include an HTTP status code, headers, and a JSON body with a message.
    """
    try:
        data = json.loads(event['body'])

        encrypted_token = data.get('session_token')
        otp = int(data.get('otp'))
        domain = data.get('domain')

        if not encrypted_token or not otp or not domain:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Invalid request'})
            }

        secret_key = os.environ["ENCRYPTION_SECRET_KEY"]
        decrypted_data = decrypt_with_time_validation(
            encrypted_token, secret_key)
        print(decrypted_data)
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
                'body': json.dumps({'message': 'Invalid OTP'})
            }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        user_pools_collection = db[os.environ["USERPOOLS_MONGO"]]
        userpool_id = user_pools_collection.find_one(
            {"sub_domain_name": domain}, {"user_pool_id": 1})
        # Your code to create the user in Cognito
        response = admin_create_user(
            decrypted_data, userpool_id["user_pool_id"])

        if response and response["success_status"] == True:
            # Your code to store the decrypted token data in MongoDB

            collection = db[os.environ["BUYER_COLLECTION"]]

            insert_data = {}
            insert_data["email_address"] = decrypted_data["email_address"]
            insert_data["first_name"] = decrypted_data["first_name"]
            insert_data["last_name"] = decrypted_data["last_name"]
            insert_data["password"] = hash_password(decrypted_data["password"])
            insert_data["terms_and_condition"] = decrypted_data["terms_and_condition"]
            insert_data["user_type"] = decrypted_data["user_type"]
            insert_data["newsletter_notification"] = decrypted_data["newsletter_notification"]
            collection.insert_one(insert_data)
            client.close()

            return {
                'statusCode': 201,
                'headers': headers,
                'body': json.dumps({'message': 'User created'})
            }
        else:
            return {
                'statusCode': 409,
                'headers': headers,
                'body': json.dumps({'message': "User already exists"})
            }

    except Exception as e:
        print(e)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': "There was an error creating the user."})
        }
