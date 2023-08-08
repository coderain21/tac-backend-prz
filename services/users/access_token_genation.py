import boto3, os
from botocore.exceptions import ClientError
client = boto3.client('cognito-idp', region_name='ap-south-1')


def generate_token():
     try:
        response = client.admin_initiate_auth(
            UserPoolId='ap-south-1_x4q81PZdM',
            ClientId='2molu70tmfi8cg42fmc07898in',
            AuthFlow='ADMIN_NO_SRP_AUTH',
            AuthParameters={
                'USERNAME': 'r@gmail.com',
                'PASSWORD': '122222'
            }
        )
        token = response['AuthenticationResult']['IdToken']
        os.environ['TOKEN'] = token
        print(os.environ.get('TOKEN'))
     except ClientError as e:
        print(e)

generate_token()