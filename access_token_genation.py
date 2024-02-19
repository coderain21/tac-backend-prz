"""
This module interacts with AWS Cognito to generate an authentication token.
"""
import boto3
import os
from botocore.exceptions import ClientError

from dotenv import load_dotenv  # Import the library

# Load environment variables from .env file
load_dotenv()

aws_access_key_id = 'AKIATZBOSV7FGIZOQCCY'
aws_secret_access_key = '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'
aws_region = 'eu-west-2'

# Configure AWS SDK
session = boto3.Session(
    aws_access_key_id= aws_access_key_id,
    aws_secret_access_key= aws_secret_access_key,
    region_name=aws_region
)

client = session.client('cognito-idp',region_name='eu-west-2')

def generate_token(user_type):
    try:
        if user_type == 'USER':
            user_pool_id = 'eu-west-2_V2BnnuKHj'#os.environ['COGNITO_USER_POOL_ID']
            client_id = '51ke5b03go43v9l2jfg08jtafk'#os.environ['COGNITO_SELLER_CLIENT_ID']
            username = 'sthuthi+testing@7edge.com'#os.environ['API_USERNAME']
            password = 'Sthu@127'
            # user_pool_id = os.environ['COGNITO_USER_POOL_ID']
            # client_id = os.environ['COGNITO_SELLER_CLIENT_ID']
            # username = 'anusha.k+indyauction@7edge.com'#os.environ['API_USERNAME']
            # password = os.environ['PASSWORD']
        if user_type == 'BUYERS':
            user_pool_id='eu-west-2_DDt5S5pVB'
            client_id='5anuin7dnpvugf1rstthom39al'
            username='sthuthi+test1@7edge.com'
            password='Sthu127'
            # user_pool_id = os.environ['BUYER_COGNITO_USER_POOL_ID']
            # client_id = os.environ['BUYER_COGNITO_SELLER_CLIENT_ID']
            # username = os.environ['BUYER_API_USERNAME']
            # password = os.environ['BUYER_PASSWORD']
            print(user_pool_id,client_id, username, password)
        if user_type == 'ADMIN':
            user_pool_id = "eu-west-2_V2BnnuKHj" #os.environ['COGNITO_ADMIN_USER_POOL_ID']
            client_id = "65cf2mbb3vjjin6kv7m63i8qrn"#os.environ['COGNITO_ADMIN_CLIENT_ID']
            username = "anusha.k+admin@7edge.com"#os.environ['ADMIN_USERNAME']
            password = "Admin@123"#os.environ['ADMIN_PASSWORD']
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
            }
        )

        token = response['AuthenticationResult']['IdToken']
        os.environ['TOKEN'] = token
        print(f'export {user_type}="{token}"')
    except ClientError as e:
        print('error sadagrfyhh', e)

generate_token("USER")
generate_token("BUYERS")
generate_token('ADMIN')