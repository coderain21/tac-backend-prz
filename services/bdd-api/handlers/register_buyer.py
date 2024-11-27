import json
import boto3
import os
import pymongo
from Crypto.Cipher import AES
from base64 import b64encode
import datetime

# Initialize AWS and MongoDB clients
cognito = boto3.client('cognito-idp')
mongo_client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
db = mongo_client[os.environ['DATABASE']]  # Replace with your DB name
buyers_collection = db[os.environ['BUYER_COLLECTION']]
counter_collection = db[os.environ['COUNTER_LOT']]

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

# Helper function for encryption
def encrypt_password(password, secret_key):
    cipher = AES.new(secret_key.encode('utf-8'), AES.MODE_ECB)
    padded_password = password.ljust(32)  # Ensure password is 32 bytes
    encrypted = cipher.encrypt(padded_password.encode('utf-8'))
    return b64encode(encrypted).decode('utf-8')

# Helper function to generate buyer ID
def generate_buyer_id():
    counter = counter_collection.find_one_and_update(
        {"record_type": "Buyers"},
        {"$inc": {"starting_sequence": 1}},
        return_document=True,
        upsert=True
    )
    sequence = counter.get("starting_sequence", 1)
    return f"B{str(sequence).zfill(4)}"

# Lambda function handler
def handler(event, context):
    try:
        # Extract the email and seller_email from the event
        body = event['queryStringParameters']  # assuming the body contains JSON
        # print('body', body)
        email = body.get('email_address')
        seller_email = body.get('seller_email')
        # print(f"Received request to create buyer with email: {email.strip()}")

        if not email or not seller_email:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "Missing required fields: email address or seller email"})
            }

        # Check if the user already exists in Cognito
        user_pool_id = os.environ['BUYER_COGNITO_USERPOOL_ID']
        response = cognito.list_users(
            UserPoolId=user_pool_id,
            Filter=f'email = "{email}"'
        )
        existing_users = response.get('Users', [])

        if existing_users:
            return {
                "statusCode": 409,
                "headers": headers,
                "body": json.dumps({"message": "User already exists.", "user": existing_users[0]})
            }

        # Generate encrypted password
        static_password = "Buyer@123"  # default password
        secret_key = 'BUYERINDYAUCTION'                                       #os.environ['PASSWORD_SECRET_KEY']  # Ensure this is set in your environment variables
        encrypted_password = encrypt_password(static_password, secret_key)

        # Generate new buyer ID
        buyer_id = generate_buyer_id()

        # Create the new buyer document in MongoDB
        new_buyer = {
            "first_name":'',                      #body.get("first_name", ""),
            "last_name": '',                       #   body.get("last_name", ""),
            "email_address": email,
            "seller_email": seller_email,
            "password": encrypted_password,
            "registered_through": "federated",
            "terms_and_condition": True,
            "user_type": "buyer",
            "newsletter_notification": False,
            "created_at": datetime.datetime.utcnow(),
            "buyer_id": buyer_id,
        }

        # Insert new buyer into MongoDB
        buyers_collection.insert_one(new_buyer)

        # Create the user in Cognito
        cognito_response = cognito.admin_create_user(
            UserPoolId=user_pool_id,
            Username=email.strip(),
            UserAttributes=[
                {"Name": "email", "Value": email.strip()}
            ],
            TemporaryPassword=static_password,
            MessageAction="SUPPRESS"  # Suppresses email invitation
        )

        # print('cognito_response', cognito_response)

        if cognito_response.get('ResponseMetadata', {}).get('HTTPStatusCode') == 200:
            print("User created successfully in Cognito. Resetting the password.")
            cognito_response = cognito.admin_set_user_password(
                UserPoolId=user_pool_id,
                Username=email.strip(),
                Password=static_password,
                Permanent=True
            )

            if cognito_response.get('ResponseMetadata', {}).get('HTTPStatusCode') == 200:
                print("Password reset successfully.")
                id_token = id_token_generator(email)
                # print('id_token', id_token)
            else:
                return {
                    "statusCode": 500,
                    "headers": headers,
                    "body": json.dumps({"error": "Failed to reset password in Cognito."})
                }


        return {
            "statusCode": 201,
            "headers": headers,
            "body": json.dumps({"message": "Buyer created successfully.", "buyer_id": buyer_id, "id_token": id_token})
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "An error occurred while creating the buyer."})
        }



def id_token_generator(email):
    user_pool_id = os.environ['BUYER_COGNITO_USERPOOL_ID']
    client_id = os.environ['BUYER_COGNITO_CLIENT_ID']
    username = email
    password = 'Buyer@123'
    response = cognito.admin_initiate_auth(
            UserPoolId=user_pool_id,
            ClientId=client_id,
            AuthFlow='ADMIN_NO_SRP_AUTH',
            AuthParameters={
                'USERNAME': username,
                'PASSWORD': password
            }
        )

    return response['AuthenticationResult']['IdToken']