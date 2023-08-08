"""
This module interacts with AWS Cognito to generate an authentication token.
"""
import boto3
import os
from botocore.exceptions import ClientError

client = boto3.client('cognito-idp', region_name='ap-south-1')

def generate_token():
    try:
        user_pool_id = os.environ['COGNITO_USER_POOL_ID']
        client_id = os.environ['COGNITO_CLIENT_ID']
        username = os.environ['USERNAME']
        password = os.environ['PASSWORD']

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
            }
        )

        token = response['AuthenticationResult']['IdToken']
        os.environ['TOKEN'] = token
        print(os.environ.get('TOKEN'))
    except ClientError as e:
        print(e)

generate_token()
