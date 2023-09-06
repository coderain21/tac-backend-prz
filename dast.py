#!/usr/bin/env python
import subprocess
import asyncio
import os
import sys
import boto3
from botocore.exceptions import ClientError

# load_dotenv()

# aws_access_key_id = os.environ.get('AWS_ACCESS_KEY_ID')
# aws_secret_access_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
# aws_region = os.environ.get('REGION')
# print(aws_access_key_id )

# session = boto3.Session(
#     aws_access_key_id= aws_access_key_id,
#     aws_secret_access_key= aws_secret_access_key,
#     region_name=aws_region
# )

client = boto3.client('cognito-idp', region_name='eu-west-2')
# client = boto3.client('cognito-idp', region_name='eu-west-2')

def find_swagger_files(root_dir):
    swagger_files = []

    service_dir = os.path.join(root_dir, 'services')
    for dirpath, dirnames, filenames in os.walk(service_dir):
        for filename in filenames:
            if 'swagger.json' in filename:
                path =os.path.join(dirpath, filename)
                pats = path.split('/services/')
                swagger_files.append('services/{0}'.format(pats[1]))

    return swagger_files

# Get the current working directory
current_directory = os.getcwd()

swagger_files = find_swagger_files(current_directory)
# swagger_files = ['swaggerdocs/users-swagger.json']
# print(swagger_files)

async def run_dast(url,index,api_token):
    command = "docker run -v $(pwd):/zap/wrk/:rw -t -e ZAP_AUTH_HEADER_VALUE='Bearer {0}' softwaresecurityproject/zap-stable zap-api-scan.py -t '{1}' -f openapi -r test_results/report{2}.html".format(api_token, url, index)
    try:
        print(command)
        process = await asyncio.create_subprocess_shell(
            command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
     
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            print("Command failed with error:", process.returncode, stderr.decode())
            print(stderr.decode())
            sys.exit(-1)
        else:
            print("Command output:", (stdout.decode()))
            print(stdout.decode())
    except asyncio.CancelledError:
        process.terminate()
        raise
    return None


def generate_token():
    try:
        # user_pool_id = "ap-south-1_6OOTn9ZoO"
        user_pool_id = os.environ.get('COGNITO_USER_POOL_ID',"eu-west-2_kqcLIvA4D")
        # client_id = "6gkfbanpha2944m0kfolp57nhq"
        client_id = os.environ.get('COGNITO_CLIENT_ID',"3duudq593a3j7jpp7afv1vbmuc")
        # username ="murali.r@7edge.com" 
        username = os.environ.get('USERNAME',"anusha.k+indyauction@7edge.com")
        # password = "Admin@123"
        password = os.environ.get('PASSWORD', "Seller@123")


        if user_pool_id is None or client_id is None or username is None or password is None:
            print("Required environment variables are not set.")
            return

        response = client.admin_initiate_auth(
            UserPoolId="eu-west-2_kqcLIvA4D",
            ClientId="3duudq593a3j7jpp7afv1vbmuc",
            AuthFlow='ADMIN_NO_SRP_AUTH',
            AuthParameters={
                'USERNAME': "anusha.k+indyauction@7edge.com",
                'PASSWORD': "Seller@123"
            }
        )
        token = response['AuthenticationResult']['AccessToken']
        print(token,"token")
        return token
        
    except ClientError as e:
        print(e)

async def main():
    api_token = generate_token()
    print(api_token)
    tasks = [run_dast(item,index, api_token) for index,item in enumerate(swagger_files)]
    results = await asyncio.gather(*tasks)

if __name__ == '__main__':
    asyncio.run(main())