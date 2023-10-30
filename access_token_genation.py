"""
This module interacts with AWS Cognito to generate an authentication token.
"""
import boto3
import os
from botocore.exceptions import ClientError

from dotenv import load_dotenv  # Import the library

# Load environment variables from .env file
load_dotenv()

# aws_access_key_id = os.environ.get('AWS_ACCESS_KEY_ID')
# aws_secret_access_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
# aws_region = os.environ.get('REGION')
aws_access_key_id = 'AKIA5QZYLFWFE6TXB756' #os.environ.get('AWS_ACCESS_KEY_ID')
aws_secret_access_key = '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'#os.environ.get('AWS_SECRET_ACCESS_KEY')
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
            user_pool_id = 'eu-west-2_kqcLIvA4D'#os.environ['COGNITO_USER_POOL_ID']
            client_id = '3duudq593a3j7jpp7afv1vbmuc'#os.environ['COGNITO_SELLER_CLIENT_ID']
            username = 'anusha.k+indyauction@7edge.com'#os.environ['API_USERNAME']
            password = 'Seller@123'
            # user_pool_id = os.environ['COGNITO_USER_POOL_ID']
            # client_id = os.environ['COGNITO_SELLER_CLIENT_ID']
            # username = 'anusha.k+indyauction@7edge.com'#os.environ['API_USERNAME']
            # password = os.environ['PASSWORD']
        if user_type == 'BUYERS':
            user_pool_id='eu-west-2_zlvzTl2Cv'
            client_id='1tfueffeiiirghhdfvet5dog1f'
            username='shrinit.poojary+100@7edge.com'
            password='$pbkdf2-sha256$29000$aW5keUBhdWN0aW9u$QS.AsCzuc29wClW.xy2TNYD.FhfbbBa9.uz7FCZMU40'
            # user_pool_id = os.environ['BUYER_COGNITO_USER_POOL_ID']
            # client_id = os.environ['BUYER_COGNITO_SELLER_CLIENT_ID']
            # username = os.environ['BUYER_API_USERNAME']
            # password = os.environ['BUYER_PASSWORD']
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
