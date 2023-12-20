"""
Module: reset_password

This module provides a function for resetting a user's password.

"""
import json
import os
import re
import boto3
import jwt
from passlib.hash import pbkdf2_sha256
from pymongo import MongoClient
from lib.get import fetch_seller_data_from_auction, fetch_user_pool_data

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': False,
}


def is_valid_password(password):
    """
    Check if a given password meets the following criteria:

    1. It must be at least 8 characters long.
    2. It must contain at least one lowercase letter.
    3. It must contain at least one uppercase letter.
    4. It must contain at least one digit.

    Parameters:
    password (str): The password string to be validated.

    Returns:
    bool: True if the password meets the criteria, False otherwise.
    """
    # Define the regular expression pattern
    pattern = r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$'

    # Use the re.match() function to check if the password matches the pattern
    if re.match(pattern, password):
        return True
    else:
        return False


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

def fetch_buyer_data(buyer_email):
    """
    Fetch the seller's email from the auction collection in MongoDB.

    Args:
        auction_id (str): The unique identifier of the auction.

    Returns:
        str: The seller's email associated with the given auction_id or None if not found.
    """
    try:
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        auction_collection = db[os.environ["BUYER_COLLECTION"]]
        data = auction_collection.find_one({"email_address": buyer_email})
        client.close()
        if data:
            return data
        return None
    except BaseException as err:
        client.close()
        print(f"Unexpected {err=}, {type(err)=}")
        raise
def password_reset(event, context):
    """
    Reset a user's password.

    Args:
        event (dict): Event data.
        context (object): Context information.

    Returns:
        dict: Response data.
    """
    try:
        data = json.loads(event['body'])

        expected_fields = ['token', 'password', '_id']
        fields_not_found = list(
            set(expected_fields).difference(data.keys()))
        if fields_not_found:
            return {"headers": headers,
                    'statusCode': 400,
                    "body": json.dumps(
                        {"message": f"Please provide {','.join(fields_not_found)}"})
                    }
        if len(data["password"]) < 8 or len(data["password"]) > 16:
            return {"headers": headers,
                    'statusCode': 400,
                    "body": json.dumps(
                        {"message": "Password must be 8-16 characters"})
                    }
        password = data.get("password")
        auction_id = data.get("_id")

        if not is_valid_password(password):
            return {
                "headers": headers,
                "statusCode": 400,
                "body": json.dumps({"message": "Invalid password"})
            }

        try:
            cognito_client = boto3.client(
                'cognito-idp', region_name='eu-west-2')
            jwt_secret = os.environ.get(
                'JWT_SECRET_KEY')
            encoded_data = jwt.decode(
                data['token'], jwt_secret, algorithms=['HS256'])

            seller_data = fetch_seller_data_from_auction(auction_id)
            if not seller_data:
                return {
                    "headers": headers,
                    "statusCode": 404,
                    "body": json.dumps({"message": "Seller doesn't exists"})}
            buyer_data = fetch_buyer_data(encoded_data.get("email_address"))
            if not buyer_data:
                return {
                    "headers": headers,
                    "statusCode": 404,
                    "body": json.dumps({"message": "Invalid or Unregistered email_address"})}

            user_pool = fetch_user_pool_data(seller_data["seller_email"])

            client = MongoClient(os.environ['MONGO_CLIENT'])
            db = client[os.environ['DATABASE']]
            buyer_collection = db[os.environ["BUYER_COLLECTION"]]

            response = reset_password(
                cognito_client, encoded_data['email_address'], password, os.environ["DEFAULT_USERPOOL_ID"])

            filter = {'email_address': encoded_data['email_address']}

            update = {'$set': {'password': hash_password(password)}}

            result = buyer_collection.update_many(filter, update)

            client.close()

            return {
                "headers": headers,
                "statusCode": 204,
                "body": json.dumps({})
            }
        except jwt.ExpiredSignatureError:
            return {
                "headers": headers,
                "statusCode": 401,
                "body": json.dumps({"message": "Token Expired"})
            }
        except jwt.InvalidTokenError:
            return {
                "headers": headers,
                "statusCode": 401,
                "body": json.dumps({"message": "Invalid Token"})
            }
        except BaseException as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps(
                {"message": "There was an error while resetting password, Please try again!"})
        }


def reset_password(client, username, password, user_pool_id):
    """
    Reset the user's password using the Cognito admin API.

    Args:
        client: Cognito client.
        username (str): User's username.
        password (str): New password.

    Returns:
        tuple: A tuple containing the API response and an error message, if any.
    """
    try:

        print("username", username)
        response = client.admin_set_user_password(
            UserPoolId=user_pool_id,
            Username=username,
            Password=password,
            Permanent=True
        )
        # print(response)

    except BaseException as err:
        print(f"Unexpected {err=}, {type(err)=}")
        raise
    print("password updated!")
    return response
