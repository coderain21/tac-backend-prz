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
    # Initialize AWS Cognito client
    cognito_client = boto3.client('cognito-idp', region_name=os.environ['REGION'])

    # Create a Cognito User Pool
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
        ]
    )
    user_pool_id = response['UserPool']['Id']

    # Create a Cognito User Pool Client
    response = cognito_client.create_user_pool_client(
        UserPoolId=user_pool_id,
        ClientName=f'Client_{sub_domain_name}',
        GenerateSecret=False,  # You can set this to True if needed
    )
    client_id = response['UserPoolClient']['ClientId']

    return user_pool_id, client_id

def fetch_item_from_dynamodb(sub_domain_name):
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
            user_pool_data = user_pools_collection.find_one({'email_address': email_address})

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
    try:
        sub_domain_name = event['pathParameters']['domain']
        data = fetch_item_from_dynamodb(sub_domain_name)

        # Encrypt the data using AWS KMS
        encrypted_data = encrypt_data(json.dumps(data, cls=Encoder))

        return {
            "statusCode": 201,
            "headers": headers,
            "body": json.dumps({"encrypted_data": encrypted_data})
        }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error"})
        }



