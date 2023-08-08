# import boto3
# import os
# from botocore.exceptions import ClientError

# from dotenv import load_dotenv
# client = boto3.client('cognito-idp', region_name='eu-west-2')

# def generate_token():
#     load_dotenv()
#     try:
#         user_pool_id = os.environ.get('COGNITO_USER_POOL_ID')
#         client_id = os.environ.get('COGNITO_CLIENT_ID')
#         username = os.environ.get('USERNAME')
#         password = os.environ.get('PASSWORD')
#         print(user_pool_id,"hgfgh")
#         if user_pool_id is None or client_id is None or username is None or password is None:
#             print("Required environment variables are not set.")
#             return

#         response = client.admin_initiate_auth(
#             UserPoolId=user_pool_id,
#             ClientId=client_id,
#             AuthFlow='ADMIN_NO_SRP_AUTH',
#             AuthParameters={
#                 'USERNAME': username,
#                 'PASSWORD': password
#             }
#         )
#         token = response['AuthenticationResult']['IdToken']
#         os.environ['TOKEN'] = token
#         print(os.environ.get('TOKEN'))
#     except ClientError as e:
#         print(e)


# generate_token()
import boto3, os
from botocore.exceptions import ClientError
from dotenv import load_dotenv
client = boto3.client('cognito-idp', region_name='eu-west-2')


def generate_token():
     try:
              
        # username = os.environ.get('USERNAME')
#         password = os.environ.get('PASSWORD')
        load_dotenv()
        user_pool_id = os.environ.get('COGNITO_USER_POOL_ID')
        client_id = os.environ.get('COGNITO_SELLER_CLIENT_ID') 
        username =  os.environ.get('API_USERNAME')
        password = os.environ.get('PASSWORD')
        print(client_id,"hgffgh")
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
