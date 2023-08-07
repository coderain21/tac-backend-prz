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
            expected_fields = ['token', 'password']
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

            # # check if the token exists
            # collection = db[os.environ['TOKENS_TABLE']]
            # query_result = collection.find_one(
            #     {'destination_address': encoded_data['email_address']}, {'password': 0})
            # print(query_result, "---<")
            # if not query_result:
            #     print('token not exists')
            #     return {
            #         "headers": headers,
            #         "statusCode": 404,
            #         "body": json.dumps({"message": "token used/expired"})
            #     }

            resp, msg = reset_password(
                client, encoded_data['email_address'], data['password'])
            
            updated_password = encode_password(data['password'])
            if msg:
                return {
                    "headers": headers,
                    "statusCode": 400,
                    "body": json.dumps({"message": msg})
                }
            collection = db[os.environ['SELLERS_TABLE']]
            admin_info = get_by_email(encoded_data['email_address'],)
            if not admin_info:
                return {
                    "headers": headers,
                    "statusCode": 404,
                    "body": json.dumps({"message": "Invalid or Unregistered email_address"})}

            collection = db[os.environ['ADMIN_TABLE']]

            filter = {'_id': admin_info['_id']}

            update = {'$set': {'password': updated_password}}

            result = collection.update_one(filter, update)

            if result.modified_count > 0:
                print('Document updated successfully.')
            else:
                print('Document not found or update failed.')

            collection = db[os.environ['TOKENS_TABLE']]
            criteria = {'destination_address': encoded_data['email_address']}

            result = collection.delete_many(criteria)
            mongo_client.close()
            if result.deleted_count == 1:
                print('Document deleted successfully.')
            else:
                print('Document not found or deletion failed.')
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

        response = client.admin_set_user_password(
            UserPoolId=os.environ.get('COGNITO_USER_POOL_ID'),
            Username=username,
            Password=password,
            Permanent=True
        )
        print(response)
    except BaseException as err:
        print(f"Unexpected {err=}, {type(err)=}")
        raise
    return response, None
