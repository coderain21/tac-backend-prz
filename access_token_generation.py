"""
This module interacts with AWS Cognito to generate an authentication token.
"""
import boto3
import os
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from boto3.session import Session

# Load environment variables
load_dotenv()

# Create a session with a specific profile
session = Session(profile_name=os.environ['PROFILE_ENV'])
print(session)
client = session.client('cognito-idp', region_name='eu-west-2')
auction_id = '682db060580c7afdcd0e79f7'

def generate_token(user_type):
    try:
        if user_type == 'USER':
            user_pool_id = os.environ['SELLER_COGNITO_USERPOOL_ID']
            client_id = os.environ['SELLER_COGNITO_CLIENT_ID']
            username = os.environ['API_USERNAME']
            password = os.environ['PASSWORD']
        if user_type == 'BUYERS':
            user_pool_id = os.environ['BUYER_COGNITO_USERPOOL_ID']
            client_id = os.environ['BUYER_COGNITO_CLIENT_ID']
            username = os.environ['BUYER_API_USERNAME']
            password = os.environ['BUYER_PASSWORD']
            print(user_pool_id,client_id, username, password)
        if user_type == 'ADMIN':
            user_pool_id = os.environ['ADMIN_COGNITO_USERPOOL_ID']
            client_id = os.environ['ADMIN_COGNITO_CLIENT_ID']
            username = os.environ['ADMIN_USERNAME']
            password = os.environ['ADMIN_PASSWORD']
            print(user_pool_id,client_id, username, password)
        if user_pool_id is None or client_id is None or username is None or password is None:
            print("Required environment variables are not set.")
            return
        response = client.admin_initiate_auth(
            UserPoolId=user_pool_id,
            ClientId=client_id,
            AuthFlow='ADMIN_NO_SRP_AUTH',
            AuthParameters={
                'USERNAME': username,
                'PASSWORD': password
            },
            ClientMetadata={
                'auction_id': auction_id
            } if user_type == 'BUYERS' and auction_id else {}
        )



        token = response['AuthenticationResult']['IdToken']
        os.environ['TOKEN'] = token
        print(f'export {user_type}="{token}"')
    except ClientError as e:
        print('error sadagrfyhh', e)

generate_token("USER")
generate_token("BUYERS")
generate_token('ADMIN')