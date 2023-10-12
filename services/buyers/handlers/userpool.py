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
import base64
from botocore.exceptions import ClientError
from lib.common_helper import Encoder

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def encrypt_data(data):
    """Encrypt data using AWS Key Management Service (KMS).

    Args:
        data (str): The data to be encrypted.

    Returns:
        str: The encrypted data as a base64-encoded string.
    """
    kms_client = boto3.client('kms', region_name=os.environ['REGION'])

    # Encrypt the data using AWS KMS
    response = kms_client.encrypt(
        KeyId=os.environ['KMS_KEY_ID'],  # Replace with your KMS key ID
        Plaintext=data.encode('utf-8')
    )

    # Encode the ciphertext in base64
    encrypted_data = base64.b64encode(response['CiphertextBlob']).decode('utf-8')

    return encrypted_data


def create_user_pool(sub_domain_name):
    """Create a Cognito User Pool with a specified subdomain and associated configurations.

    Args:
        sub_domain_name (str): The subdomain name used for creating the user pool.

    Returns:
        str: The user pool ID and client ID associated with the created user pool.
    """
    # Initialize AWS Cognito client
    cognito_client = boto3.client('cognito-idp', region_name=os.environ['REGION'])

    # Define the password policy
    password_policy = {
        'MinimumLength': 6,  # Minimum password length
        'RequireUppercase': True,  # Requires at least one uppercase letter
        'RequireLowercase': True,  # Requires at least one lowercase letter
        'RequireNumbers': True,    # Requires at least one number
    }

    # Create a Cognito User Pool with the password policy
    response = cognito_client.create_user_pool(
        PoolName=f'userpool_{sub_domain_name}',
        AutoVerifiedAttributes=['email'],
        Schema=[
            {
                'Name': 'email',
                'AttributeDataType': 'String',
                'Mutable': False,
                'Required': True
            },
        ],
        Policies={
            'PasswordPolicy': password_policy
        }
    )
    user_pool_id = response['UserPool']['Id']

    # Create a Cognito User Pool Client
    response = cognito_client.create_user_pool_client(
        UserPoolId=user_pool_id,
        ClientName=f'Client_{sub_domain_name}',
        GenerateSecret=False,  # You can set this to True if needed
    )
    client_id = response['UserPoolClient']['ClientId']
    group_response = cognito_client.create_group(
        GroupName='buyer',
        UserPoolId=user_pool_id
    )

    return user_pool_id, client_id

def fetch_item_from_dynamodb(sub_domain_name):
    """Fetch data from DynamoDB based on a subdomain name and query MongoDB for user pool data.

    Args:
        sub_domain_name (str): The subdomain name to use for data retrieval.

    Returns:
        dict: User pool data associated with the subdomain name or an error response if the subdomain is not found.
    """
    try:
        dynamodb = boto3.client('dynamodb', region_name='us-east-1')
        # Fetch item from DynamoDB using sub_domain_name
        response = dynamodb.get_item(
            TableName=os.environ['SUB_DOMAIN_TABLE'],
            Key={
                'subdomain_name': {'S': sub_domain_name}
            }
        )
        item = response.get('Item', None)
        if item:
            email_address = item['email_address']['S']

            client = MongoClient(os.environ['MONGO_CLIENT'])
            db = client[os.environ['DATABASE']]
            user_pools_collection = db[os.environ["USERPOOLS_MONGO"]]

            # Query MongoDB for user pool data
            user_pool_data = user_pools_collection.find_one({'email_address': email_address},{"_id":0,"email_address":0,"sub_domain_name":0})

            if not user_pool_data:
                # If user pool data doesn't exist, create it
                user_pool_id, client_id = create_user_pool(sub_domain_name)
                user_pool_data = {
                    'sub_domain_name': sub_domain_name,
                    'email_address': email_address,
                    'user_pool_id': user_pool_id,
                    'client_id': client_id
                }
                user_pools_collection.insert_one(user_pool_data)
                print("User pool and client created and stored in MongoDB:", user_pool_data)
            else:
                print("User pool data already exists in MongoDB:", user_pool_data)
            client.close()
            return user_pool_data
        else:
            return {
                "headers": headers,
                "statusCode": 404,
                "body": json.dumps({"message": "Domain not found"})
            }

    except ClientError as e:
        print("Error:", e)
        return None

def create(event, context):
    """Handle a create event for a subdomain, fetch relevant data, encrypt it, and return the encrypted data as a response.

    Args:
        event (dict): The event data containing information about the subdomain in the 'pathParameters'.
        context: The AWS Lambda context object (not used in this function).

    Returns:
        dict: A response containing the encrypted data as a base64-encoded string or an error response in case of issues.
    """
    try:
        sub_domain_name = event['pathParameters']['domain']
        data = fetch_item_from_dynamodb(sub_domain_name)
        print(data)
        # Encrypt the data using AWS KMS
        encrypted_data = encrypt_data(json.dumps(data, cls=Encoder))

        return {
            "statusCode": 201,
            "headers": headers,
            "body": json.dumps({"data": encrypted_data})
        }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error"})
        }
