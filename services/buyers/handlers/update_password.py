'''this api updates the current password'''
import datetime
import json
import os
import boto3
from pymongo import MongoClient
from passlib.hash import pbkdf2_sha256
from bson import ObjectId

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
user_pools_collection = db[os.environ["USERPOOLS_MONGO"]]
auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
buyer_collection = db[os.environ["BUYER_COLLECTION"]]
access_logs_collection= db[os.environ["ACCESS_LOGS_TABLE"]]


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
            UserPoolId= os.environ['DEFAULT_USERPOOL_ID'],
            ClientId= os.environ['BUYER_COGNITO_CLIENT_ID'],
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
        print('errrrrrrrrrrrr', e)
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
        print(e)
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
        print('event', event['requestContext']['authorizer']['claims'] )
        try:
            # email_address = event['requestContext']['authorizer']['claims']['email']
            # print('email', email_address)
            # if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'buyer' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
            #     print('here in first')
            #     return {
            #         "statusCode": 403,
            #         "headers": headers,
            #         "body": json.dumps({"message": "You do not have access to perform this API action"})
            #     }
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
            print('email', email_address)
        except:
            print('here in second')
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        data = json.loads(event['body'])
        old_password = data.get('old_password')
        new_password = data.get('new_password')
        confirm_password = data.get('confirm_password')
        domain = data.get('domain')
        auction_id = data.get('auction_id')
        # client = MongoClient(
        #               os.environ['MONGO_CLIENT'],
        #               maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
        #                 )
        # db = client[os.environ['DATABASE']]
        # user_pools_collection = db[os.environ["USERPOOLS_MONGO"]]
        # auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        # buyer_collection = db[os.environ["BUYER_COLLECTION"]]
        seller_email = auction_collection.find_one({"_id": ObjectId(auction_id)},
                                                {'seller_email': 1}).get('seller_email')

        userpool_id = os.environ["DEFAULT_USERPOOL_ID"]
        buyer = buyer_collection.find_one(
            {'seller_email': seller_email, 'email_address': email_address})
        password = buyer['password']
        encrypt_password = hash_password(old_password)
        checkOldPassword = cognitoCheck(email_address, old_password)
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
        if new_password == encrypt_password:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "New password cannot be the same as old password. Please try again."})
            }
        confirm_password = hash_password(confirm_password)
        if new_password != confirm_password:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Current password and new password not matching"})
            }
        userdata= {'email_address':email_address, 'password': update_password}
        success_status = admin_set_password(userdata, userpool_id)
        if success_status['success_status'] is not True:
            return {
                "statusCode": 500,
                "headers": headers,
                "body": json.dumps({"message": "there was some error while updating"})
            }

        # Get the current timestamp in seconds and convert to milliseconds
        timestamp_ms = int(datetime.datetime.now().timestamp() * 1000)

        # Convert to float and format as a string with '.0'
        formatted_timestamp = float(timestamp_ms)

        #adding logs of password update
        access_logs = {
            "actor_id": buyer.get('buyer_id'),
            "updated_by": {
                "type": 'Buyer',
                "name": ' '.join(filter(None, [buyer.get('first_name'), buyer.get('last_name')])),
                "email_address": email_address,
            },
            "section": {
                "name": 'Bidder Management',
                "action": 'Update Password'
            },
            "updated_at": formatted_timestamp
        }
        access_logs_collection.insert_one(access_logs)


        return {
                "statusCode": 204,
                "headers": headers,
                "body": json.dumps({"message": "Password updated successfully"})
            }
    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"message": "Internal server error"})
        }
        