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
import boto3
from pymongo import MongoClient
from passlib.hash import pbkdf2_sha256
from bson import ObjectId
import datetime
import pymongo

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def hash_password(password):
    """Generate a salt and hash the provided password using Passlib's pbkdf2_sha256.

    Args:
        password (str): The plaintext password to hash.

    Returns:
        str: The hashed password as a UTF-8 encoded string.
    """
    # Generate a hashed password using Passlib's pbkdf2_sha256
    hashed_password = pbkdf2_sha256.using(salt=b"indy@auction").hash(password)
    return hashed_password

cognito_client = boto3.client('cognito-idp', region_name=os.environ['REGION'])


def admin_create_user(userData, userpool_id,seller_email,default):
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
        group_name = seller_email.split('@')[0]
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

        password_params = {
            'UserPoolId': userpool_id,
            'Username': userData['email_address'],
            'Password': "Buyer@123",
            'Permanent': True
        }
        cognito_client.admin_set_user_password(**password_params)
        if user:
            roles = [group_name, userData["user_type"]]
            for role in roles:
                print('roles', role)
                try:
                    # Define the parameters for the API call
                    params = {
                        'GroupName': role,
                        'UserPoolId': userpool_id,
                        'Username': userData['email_address']
                    }
                    # Call the admin_add_user_to_group API
                    cognito_client.admin_add_user_to_group(**params)
                    print(f"Successfully added user {userData['email_address']} to group {role}")
                except Exception as e:
                    print("errrrrr", e)
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


def handler(event, context):
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
        print('dataa', data)
        domain = data.get('domain')
        auction_id = data.get('id')
        print('#####', domain, auction_id)
        default = domain == os.environ["DEFAULT_SUB_DOMAIN"]
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        user_pools_collection = db[os.environ["USERPOOLS_MONGO"]]
        counter_collection = db[os.environ["COUNTER_LOT"]]
        auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        print("auction_collection", auction_collection)
        seller_email = auction_collection.find_one({"_id":ObjectId(auction_id)},{'seller_email' : 1}).get('seller_email')

        # userpool_id = user_pools_collection.find_one(
        #     {"sub_domain_name": domain,"email_address":seller_email}, {"user_pool_id": 1})

        print(seller_email)
        user_pool_id = os.environ["BUYER_COGNITO_USERPOOL_ID"]
        # Your code to create the user in Cognito
        response = admin_create_user(
            data, user_pool_id,seller_email,default)
        if response and response["success_status"] == True:
            # Your code to store the decrypted token data in MongoDB
            collection = db[os.environ["BUYER_COLLECTION"]]
            counter = counter_collection.find_one_and_update({
                                                      'record_type': 'Buyers'},
                                                     {'$inc': {
                                                         'starting_sequence': 1}},
                                                     return_document=pymongo.ReturnDocument.AFTER,
                                                     upsert=True)
            insert_data = {}
            insert_data["email_address"] = data["email_address"]
            insert_data["first_name"] = data["first_name"]
            insert_data["last_name"] = data["last_name"]
            insert_data["terms_and_condition"] = data["terms_and_condition"]
            insert_data["user_type"] = data["user_type"]
            insert_data["newsletter_notification"] = data["newsletter_notification"]
            insert_data["seller_email"] = seller_email
            insert_data["created_at"] = datetime.datetime.utcnow()
            insert_data["buyer_id"] = f'B{counter["starting_sequence"]:04d}'
            insert_data["full_name"]= data["first_name"] + " " + data["last_name"]
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
