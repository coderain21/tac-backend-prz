#!/usr/bin/env python
import subprocess
import asyncio
import os
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv  # Import the library

# Load environment variables from .env file
load_dotenv()

# Configure AWS credentials and region
aws_access_key_id = os.environ['AWS_ACCESS_KEY_ID']
aws_secret_access_key = os.environ['AWS_SECRET_ACCESS_KEY']
region = os.environ['AWS_REGION']

# Create a Cognito Identity Provider client with the configured credentials
client = boto3.client('cognito-idp', region_name=region, aws_access_key_id=aws_access_key_id, aws_secret_access_key=aws_secret_access_key)

def find_swagger_files(root_dir):
    swagger_files = []

    service_dir = os.path.join(root_dir, 'services')
    for dirpath, dirnames, filenames in os.walk(service_dir):
        for filename in filenames:
            if 'swagger.json' in filename:
                path = os.path.join(dirpath, filename)
                pats = path.split('/services/')
                swagger_files.append('services/{0}'.format(pats[1]))

    return swagger_files

# Get the current working directory
current_directory = os.getcwd()

swagger_files = find_swagger_files(current_directory)
# swagger_files = ['swaggerdocs/users-swagger.json']
print(swagger_files)

async def run_dast(url, index, api_token):
    print(url)
    # current_directory = os.getcwd()
    command = 'docker run -v "$(pwd):/zap/wrk/:rw" -t -e ZAP_AUTH_HEADER_VALUE="Bearer {0}" softwaresecurityproject/zap-stable zap-api-scan.py -t "{1}" -f openapi -r test_results/report{2}.html'.format(api_token, url, index)
    # command = f"docker run -v {current_directory}:/zap/wrk/:rw -t -e ZAP_AUTH_HEADER_VALUE='Bearer {api_token}' softwaresecurityproject/zap-stable zap-api-scan.py -t '{url}' -f openapi -r test_results/report{index}.html"
    try:
        print(command)
        process = await asyncio.create_subprocess_shell(
            command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        print(process.returncode, "process.returncode")
        # if process.returncode != 0:
        #     error_message = "Command failed with error:\n" + stderr.decode()
        #     raise Exception(error_message)
        # else:
        print("Command output:")
        print(stdout.decode())
    except asyncio.CancelledError:
        process.terminate()
        raise
    return None

async def run_dast_for_swagger_files(swagger_files):
    tasks = []
    api_token = generate_token()
    for index, url in enumerate(swagger_files):
        tasks.append(run_dast(url, index, api_token))

    await asyncio.gather(*tasks)

def generate_token():
    try:
        user_pool_id = 'eu-west-2_HfcLwHwnO'
        client_id = '4hq3rgf5j572n1ocashp2esc1c'
        username = 'anusha.k+buyer1@7edge.com'
        password = 'Buyer123'

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
        return token
    except ClientError as e:
        print(e)

async def main():
    try:
        await run_dast_for_swagger_files(swagger_files)
    except Exception as e:
        print("Error in main function:", str(e))

if __name__ == '__main__':
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
