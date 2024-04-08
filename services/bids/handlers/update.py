# """
# Module: user_update_module

# This module contains functions related to updating user information and adding users to Cognito groups.
# """
# from pymongo import MongoClient
# import json
# import boto3
# import os
# from bson import ObjectId

# headers = {
#     'Content-Type': 'application/json',
#     'Access-Control-Allow-Origin': '*',
#     'Access-Control-Allow-Credentials': True,
#     'Access-Control-Allow-Headers': '*',
#     'Access-Control-Allow-Methods': '*'
# }

# cognito_client = boto3.client('cognito-idp', region_name=os.environ['REGION'])


# def fetch_seller_email_from_auction(auction_id):
#     """
#     Fetch the seller's email from the auction collection in MongoDB.

#     Args:
#         auction_id (str): The unique identifier of the auction.

#     Returns:
#         str: The seller's email associated with the given auction_id or None if not found.
#     """
#     client = MongoClient(os.environ['MONGO_CLIENT'])
#     db = client[os.environ['DATABASE']]
#     auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
#     email = auction_collection.find_one({"_id": ObjectId(auction_id)}, {
#                                         'seller_email': 1}).get('seller_email')
#     client.close()
#     return email


# def update_user(event, context):
#     """
#     Update user information and add the user to a Cognito group.

#     Args:
#         event (dict): The AWS Lambda event object containing details about the API Gateway request.
#         context (object): The AWS Lambda context object.

#     Returns:
#         dict: A dictionary containing the API Gateway response.
#     """
#     try:
#         try:
#             print(event)
#             cognito_data = json.loads(
#                 event['requestContext']['authorizer']['data'])
#             print(cognito_data)
#             email_address = cognito_data['email']
#             if "cognito:groups" in cognito_data and not 'buyer' in cognito_data["cognito:groups"]:
#                 return {
#                     "statusCode": 403,
#                     "headers": headers,
#                     "body": json.dumps({"message": "You do not have access to perform this API action"})
#                 }
#         except:
#             return {
#                 "statusCode": 403,
#                 "headers": headers,
#                 "body": json.dumps({"message": "You do not have access to perform this API action"})
#             }

#         data = json.loads(event["body"])
#         expected_fields = ["auction_id", "group"]
#         fields_not_found = list(set(expected_fields).difference(data.keys()))
#         if fields_not_found:
#             return {"headers": headers,
#                     'statusCode': 400,
#                     "body": json.dumps(
#                         {"message": f"Please provide {','.join(fields_not_found)}"})
#                     }
#         auction_id = data.get("auction_id")
#         group = data.get("group")
#         new = data.get("new",False)
#         seller_email = fetch_seller_email_from_auction(auction_id)
#         # Add user to the specified Cognito group
#         cognito_client.admin_add_user_to_group(
#             GroupName=group,
#             UserPoolId=os.environ["DEFAULT_USERPOOL_ID"],
#             Username=email_address
#         )

#         if seller_email is not None:
#             buyer_data_to_add = {
#                 "user_type": "buyer",
#                 "password": "",
#                 "email_address": email_address,
#                 "newsletter_notification": False,
#                 "seller_email": seller_email,
#                 "terms_and_condition": True,
#                 "first_name": cognito_data['given_name'],
#                 "last_name": cognito_data['family_name']
#             }
#             client = MongoClient(os.environ['MONGO_CLIENT'])
#             db = client[os.environ['DATABASE']]
#             buyer_collection = db[os.environ["BUYER_COLLECTION"]]

#             # Check if the user already has a seller_email associated
#             buyer_data = buyer_collection.find_one(
#                 {"email_address": email_address, "seller_email": seller_email})

#             if buyer_data is None:
#                 if new is True:
#                     print("new")
#                     new_data = {
#                         "user_type": "buyer",
#                         "password": "",
#                         "email_address": email_address,
#                         "newsletter_notification": False,
#                         "seller_email": seller_email,
#                         "terms_and_condition": True,
#                         "first_name": cognito_data['given_name'],
#                         "last_name": cognito_data['family_name']
#                     }
#                     buyer_data_new = buyer_collection.find_one(
#                         {"email_address": email_address},{"_id":0,"seller_email":0})
#                     print("-->",buyer_data_new)
#                     if buyer_data_new is not None:
#                         buyer_data_new["seller_email"]=seller_email
#                         buyer_collection.insert_one(buyer_data_new)
#                     else:
#                         buyer_collection.insert_one(new_data)

#                 else:
#                     # Check if the user has an existing record without seller_email
#                     buyer_data_without_seller = buyer_collection.find_one(
#                         {"email_address": email_address, "registered_through": "federated"})
#                     print("-->", buyer_data_without_seller)
#                     if buyer_data_without_seller is not None and "seller_email" not in buyer_data_without_seller:
#                         buyer_collection.update_one({"_id": buyer_data_without_seller["_id"]}, {
#                                                     '$set': {"seller_email": seller_email, "registered_through": ""}})

#                     if buyer_data_without_seller == None:
#                         buyer_collection.insert_one(buyer_data_to_add)

#             client.close()
#             return {
#                 "statusCode": 204,
#                 'headers': headers,
#                 "body": json.dumps({})
#             }
#         else:
#             return {
#                 "statusCode": 404,
#                 'headers': headers,
#                 "body": json.dumps({"message": "User does not exist"})
#             }
#     except Exception as err:
#         print(err)
#         return {
#             "statusCode": 500,
#             'headers': headers,
#             "body": json.dumps({"message": "There was an error while adding to the group"})
#         }


"""This module contains AWS Lambda functions for creating user pools and handling requests related to subdomains, DynamoDB, AWS KMS, and MongoDB.

Module Functions:
- encrypt_data(data): Encrypt data using AWS Key Management Service (KMS).
- create_user_pool(sub_domain_name): Create a Cognito User Pool with a specified subdomain.
- fetch_item_from_dynamodb(sub_domain_name): Fetch an item from DynamoDB based on a subdomain name.
- create(event, context): Handle a create event for a subdomain, fetch relevant data, encrypt it, and return the encrypted data as a response.

The code provides functionality to create user pools in Amazon Cognito, fetch data from DynamoDB based on subdomains, and encrypt the data using AWS KMS. It also handles errors and returns appropriate responses.

Note that this code assumes specific environment variables are set for configuration, such as 'REGION', 'KMS_KEY_ID', 'SUB_DOMAIN_TABLE', 'MONGO_CLIENT', 'DATABASE', 'USERPOOLS_MONGO', and others as required.
"""
import boto3
from pymongo import MongoClient
import json
import os
from bson import ObjectId
import base64
from botocore.exceptions import ClientError
from lib.common_helper import Encoder
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

# def encrypt_data(data):
#     """Encrypt data using AWS Key Management Service (KMS).

#     Args:
#         data (str): The data to be encrypted.

#     Returns:
#         str: The encrypted data as a base64-encoded string.
#     """
#     kms_client = boto3.client('kms', region_name=os.environ['REGION'])

#     # Encrypt the data using AWS KMS
#     response = kms_client.encrypt(
#         KeyId=os.environ['KMS_KEY_ID'],
#         Plaintext=data.encode('utf-8')
#     )

#     # Encode the ciphertext in base64
#     encrypted_data = base64.b64encode(response['CiphertextBlob']).decode('utf-8')

#     return encrypted_data

# def create_user_pool(username):
#     """Create a Cognito User Pool with a specified subdomain and associated configurations.

#     Args:
#         sub_domain_name (str): The subdomain name used for creating the user pool.

#     Returns:
#         str: The user pool ID and client ID associated with the created user pool.
#     """
#     # Initialize AWS Cognito client
#     cognito_client = boto3.client('cognito-idp', region_name=os.environ['REGION'])

#     # Define the password policy
#     password_policy = {
#         'MinimumLength': 6,  # Minimum password length
#         'RequireUppercase': True,  # Requires at least one uppercase letter
#         'RequireLowercase': True,  # Requires at least one lowercase letter
#         'RequireNumbers': True,    # Requires at least one number
#     }

#     # Create a Cognito User Pool with the password policy
#     # response = cognito_client.create_user_pool(
#     #     PoolName=f'{os.environ["STAGE"]}_userpool_{sub_domain_name}',
#     #     AutoVerifiedAttributes=['email'],
#     #     Schema=[
#     #         {
#     #             'Name': 'email',
#     #             'AttributeDataType': 'String',
#     #             'Mutable': True,
#     #             'Required': True
#     #         },
#     #     ],
#     #     Policies={
#     #         'PasswordPolicy': password_policy
#     #     },
#     #     AdminCreateUserConfig={
#     #         'AllowAdminCreateUserOnly': True
#     #     }
#     # )
#     user_pool_id = os.environ["DEFAULT_USERPOOL_ID"]

#     # Create a Cognito User Pool Client
#     response = cognito_client.create_user_pool_client(
#         UserPoolId=user_pool_id,
#         ClientName=f'Client_{username}',
#         GenerateSecret=False,
#         TokenValidityUnits={
#         'AccessToken': 'minutes',
#         'IdToken': 'minutes',
#         'RefreshToken': 'days'
#         },
#         ExplicitAuthFlows=[
#         'ALLOW_ADMIN_USER_PASSWORD_AUTH','ALLOW_CUSTOM_AUTH','ALLOW_USER_PASSWORD_AUTH','ALLOW_USER_SRP_AUTH','ALLOW_REFRESH_TOKEN_AUTH'
#         ],
#         AccessTokenValidity=5,
#         IdTokenValidity=5,
#         RefreshTokenValidity=3650
#     )
#     client_id = response['UserPoolClient']['ClientId']
#     group_response = cognito_client.create_group(
#         GroupName=f'{username}',
#         UserPoolId=user_pool_id
#     )
#     return user_pool_id, client_id

# def fetch_item_from_dynamodb(sub_domain_name, default,id):
#     """Fetch data from DynamoDB based on a subdomain name and query MongoDB for user pool data.

#     Args:
#         sub_domain_name (str): The subdomain name to use for data retrieval.
#         default (bool): True if it's a default domain, False otherwise.

#     Returns:
#         dict: User pool data associated with the subdomain name or an error response if the subdomain is not found.
#     """
#     try:
#         # if not default:
#         #     dynamodb = boto3.client('dynamodb', region_name='us-east-1')
#         #     # Fetch item from DynamoDB using sub_domain_name
#         #     response = dynamodb.get_item(
#         #         TableName=os.environ['SUB_DOMAIN_TABLE'],
#         #         Key={
#         #             'subdomain_name': {'S': sub_domain_name}
#         #         }
#         #     )
#         #     item = response.get('Item', None)
#         #     if item:
#         #         email_address = item['email_address']['S']
#         #     else:
#         #         return {
#         #             "headers": headers,
#         #             "statusCode": 404,
#         #             "body": json.dumps({"message": "Domain not found"})
#         #         }

#         # If it's the default domain, fetch seller's email from the auction collection using an ID
#         seller_email = fetch_seller_email_from_auction(id)
#         print(seller_email)
#         email_data = seller_email

#         # Split the seller_email before '@' to get the username
#         username = email_data.split('@')[0]
#         print(username)
#         # Check if user pool data already exists for the seller email and domain
#         user_pool_data = get_user_pool_data(email_data, sub_domain_name)

#         # if not user_pool_data:
#         #     # Create the user pool with the seller email
#         #     user_pool_id, client_id = create_user_pool(username)

#         #     # Store user pool data in MongoDB
#         #     user_pool_data = {
#         #         'sub_domain_name': sub_domain_name,
#         #         'email_address': email_data,
#         #         'user_pool_id': user_pool_id,
#         #         'client_id': client_id,
#         #     }

#         #     # Store user pool data in MongoDB
#         #     store_user_pool_data_in_mongodb(user_pool_data)
#         print(user_pool_data)
#         return user_pool_data
#     except ClientError as e:
#         print("Error:", e)
#         return None

def fetch_seller_email_from_auction(auction_id):
    """
    Fetch the seller's email from the auction collection in MongoDB.

    Args:
        auction_id (str): The unique identifier of the auction.

    Returns:
        str: The seller's email associated with the given auction_id or None if not found.
    """
   
    auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
    email = auction_collection.find_one({"_id":ObjectId(auction_id)},{'seller_email' : 1}).get('seller_email')
    return email

# def store_user_pool_data_in_mongodb(user_pool_data):
#     """
#     Store user pool data in a MongoDB collection.

#     Args:
#         user_pool_data (dict): User pool data to be stored, including user pool ID, client ID, email, and subdomain.

#     Returns:
#         None
#     """
#     client = MongoClient(os.environ['MONGO_CLIENT'])
#     db = client[os.environ['DATABASE']]
#     user_pools_collection = db[os.environ["USERPOOLS_MONGO"]]
#     user_pools_collection.insert_one(user_pool_data)
#     client.close()

# def get_user_pool_data(username, sub_domain_name):
#     """
#     Retrieve user pool data from a MongoDB collection based on username and subdomain.

#     Args:
#         username (str): The username (email) associated with the user pool.
#         sub_domain_name (str): The subdomain name associated with the user pool.

#     Returns:
#         dict: User pool data, excluding email and subdomain, or None if not found.
#     """
#     client = MongoClient(os.environ['MONGO_CLIENT'])
#     db = client[os.environ['DATABASE']]
#     user_pools_collection = db[os.environ["SUB_DOMAIN_TABLE"]]
#     user_pool_data = user_pools_collection.find_one({
#         'seller_email': username,
#         'subdomain': sub_domain_name
#     },{"_id":0})

#     client.close()
#     return user_pool_data

def create(event, context):
    """Handle a create event for a subdomain, fetch relevant data, encrypt it, and return the encrypted data as a response.

    Args:
        event (dict): The event data containing information about the subdomain in the 'pathParameters'.
        context: The AWS Lambda context object (not used in this function).

    Returns:
        dict: A response containing the encrypted data as a base64-encoded string or an error response in case of issues.
    """
    try:
        # sub_domain_name = event['queryStringParameters'].get('domain')
        auction_id = event['queryStringParameters'].get('auction_id')
        # default = sub_domain_name == os.environ["DEFAULT_SUB_DOMAIN"]
        data = fetch_seller_email_from_auction(auction_id)
       
        # Encrypt the data using AWS KMS
        # if data is not None:
        #     data["auth_domain"] = os.environ["DEFAULT_COGNITO_DOMAIN"]
        #     data["user_pool_id"] = os.environ["DEFAULT_USERPOOL_ID"]
        # encrypted_data = encrypt_data(json.dumps(data, cls=Encoder))

        return {
            "statusCode": 201,
            "headers": headers,
            "body": json.dumps({"seller_email": data})
        }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error"})
        }
