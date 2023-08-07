"""
Module: reset_password

This module provides a function for resetting a user's password.

"""
import json
import os
import boto3
import jwt
from lib.get import get_by_email
from pymongo import MongoClient
from schema import SchemaError, SchemaWrongKeyError
from utils.helper import encode_password, admin_password_reset_schema


headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': False,
}


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
        mongo_client = MongoClient(os.environ['MONGO_CLIENT'])
        db = mongo_client[os.environ['DATABASE']]
        data = json.loads(event['body'])
        try:
            expected_fields = ['token', 'password','encrypted_password']
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
            admin_password_reset_schema.validate(data)
        except SchemaWrongKeyError:
            return {
                "headers": headers,
                "statusCode": 400,
                "body": json.dumps({"message": "Unexpected Key found"})
            }
        except SchemaError as error:
            return {
                "headers": headers,
                "statusCode": 500,
                "body": json.dumps({"message": str(error)})
            }
        try:
            client = boto3.client('cognito-idp', region_name='eu-west-2')
            jwt_secret = os.environ.get(
                'JWT_SECRET_KEY')
            encoded_data = jwt.decode(
                data['token'], jwt_secret, algorithms=['HS256'])


            resp, msg = reset_password(
                client, encoded_data['email_address'], data['password'])
            updated_password = data['encrypted_password']
            if msg:
                return {
                    "headers": headers,
                    "statusCode": 400,
                    "body": json.dumps({"message": msg})
                }
            collection = os.environ['SELLERS_TABLE']
            admin_info = get_by_email(encoded_data['email_address'],collection)
            if not admin_info:
                return {
                    "headers": headers,
                    "statusCode": 404,
                    "body": json.dumps({"message": "Invalid or Unregistered email_address"})}
    

            filter = {'_id': admin_info['_id']}

            update = {'$set': {'password': updated_password}}
            collection = db[os.environ['SELLERS_TABLE']]
            result = collection.update_one(filter, update)
         
            mongo_client.close()

            return {
                "headers": headers,
                "statusCode": 204,
                "body": json.dumps({"message": "Password changed successfully"})
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


def reset_password(client, username, password):
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
        print("username",username)
        response = client.admin_set_user_password(
            UserPoolId=os.environ.get('COGNITO_USER_POOL_ID'),
            Username=username,
            Password=password,
            Permanent=True
        )
        # print(response)
        
    except BaseException as err:
        print(f"Unexpected {err=}, {type(err)=}")
        raise
    print("password updated!")
    return response, None
