'''this api updates the current password'''
import json
import os
import boto3
from pymongo import MongoClient
from passlib.hash import pbkdf2_sha256

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


def cognitoCheck(email_address, encrypt_password):
    try:
        response = cognito_client.admin_initiate_auth(
            UserPoolId = os.environ['ADMIN_COGNITO_USERPOOL_ID'],
            ClientId= os.environ['ADMIN_COGNITO_CLIENT_ID'],
            AuthFlow='ADMIN_NO_SRP_AUTH',
            AuthParameters={
                'USERNAME': email_address,
                'PASSWORD': encrypt_password
            }
        )
        return {
                'success_status': True,
            }
    except Exception as e:
        print('Error in cognitoCheck', e)
        return {
                'success_status': False,
            }

def admin_set_password(userData, userpool_id):
    """
    The `admin_set_password` function updates the password for a user in a user pool using the AWS
    Cognito service.

    :param userData: The `userData` parameter is a dictionary that contains the user's email address and
    password. It should have the following structure:
    :param userpool_id: The `userpool_id` parameter is the unique identifier for the user pool in Amazon
    Cognito. It is used to specify which user pool the user belongs to
    :return: a dictionary with two keys: 'success_status' and 'message'. The value of 'success_status'
    indicates whether the password update was successful or not, and the value of 'message' provides a
    corresponding message.
    """

    try:
        password_params = {
            'UserPoolId': userpool_id,
            'Username': userData['email_address'],
            'Password': userData['password'],
            'Permanent': True
        }
        response = cognito_client.admin_set_user_password(**password_params)
        if response:
            return {
                'success_status': True,
                'message': 'Password updated successfully'
            }
        else:
            return {
                'success_status': False,
                'message': 'There was an error while updating the password'
            }

    except Exception as e:
        print('Error in admin set password',str(e))
        return {
            'success_status': False,
            'message': str(e)
        }


def update_password(event, context):
    """
    The above function is a Python code that updates a user's password in a Cognito user pool based on
    certain conditions and returns appropriate responses.

    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. It typically includes details such as the HTTP request, headers, and body
    :param context: The `context` parameter is a context object that provides information about the
    runtime environment of the function. It includes details such as the AWS request ID, function name,
    and other metadata
    :return: a JSON response with a status code, headers, and a message body. The specific response
    depends on the conditions and logic within the function.
    """
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
        except:
            return {
                    "statusCode": 403,
                    "headers": headers,
                    "body": json.dumps({"message": "You do not have access to perform this API action"})
                }
        data = json.loads(event['body'])
        print('data', data)
        old_password = data.get('old_password')
        new_password = data.get('new_password')
        confirm_password = data.get('confirm_password')
        # auction_id = data.get('auction_id')
        # client = MongoClient(os.environ['MONGO_CLIENT'])
        # db = client[os.environ['DATABASE']]
        # # auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        # buyer_collection = db[os.environ["BUYER_COLLECTION"]]
        # # seller_email = auction_collection.find_one({"_id": ObjectId(auction_id)},
        #                                         # {'seller_email': 1}).get('seller_email')

        userpool_id = os.environ["ADMIN_COGNITO_USERPOOL_ID"]
        encrypt_password = hash_password(old_password)
        checkOldPassword = cognitoCheck(email_address, old_password)
        print('checkOldPassword', checkOldPassword)
        if not checkOldPassword['success_status']:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({
                    "message": "Current password is incorrect. The password update cannot be completed"
                })
            }
        update_password = new_password
        new_password= hash_password(new_password)
        print('new_password', new_password)
        if new_password == encrypt_password:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "New password cannot be the same as old password. Please try again."})
            }
        confirm_password = hash_password(confirm_password)
        print('confirm_password', confirm_password)
        if new_password != confirm_password:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Current password and new password not matching"})
            }
        userdata= {'email_address':email_address, 'password': update_password}
        success_status = admin_set_password(userdata, userpool_id)
        print('success_status', success_status)
        if success_status['success_status'] is not True:
            print('there was some error while updating password')
            return {
                "statusCode": 500,
                "headers": headers,
                "body": json.dumps({"message": "there was some error while updating"})
            }
        return {
                "statusCode": 204,
                "headers": headers,
                "body": json.dumps({"message": "Password updated successfully"})
            }
    except Exception as e:
        print('Error in update password:', str(e))
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"message": "Internal server error"})
        }