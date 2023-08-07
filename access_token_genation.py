import boto3, os
from botocore.exceptions import ClientError
client = boto3.client('cognito-idp', region_name='ap-south-1')


def generate_token():
     try:
        response = client.admin_initiate_auth(
            UserPoolId='eu-west-2_kqcLIvA4D',
            ClientId='3duudq593a3j7jpp7afv1vbmuc',
            AuthFlow='ADMIN_NO_SRP_AUTH',
            AuthParameters={
                'USERNAME': 'aishwarya@7edge.com',
                'PASSWORD': 'Aishu@76980'
            }
        )
        token = response['AuthenticationResult']['IdToken']
        os.environ['TOKEN'] = token
        print(os.environ.get('TOKEN'))
     except ClientError as e:
        print(e)

generate_token()