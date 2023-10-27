#!/usr/bin/env python
import subprocess
import asyncio
import os
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
import git  # Import the Git module

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
    command = f"docker run -v $(pwd):/zap/wrk/:rw -t -e ZAP_AUTH_HEADER_VALUE='Bearer {api_token}' softwaresecurityproject/zap-stable zap-api-scan.py -t '{url}' -f openapi -r test_results/report{index}.html"
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

def is_file_changed_in_latest_commit(file_to_check):
    repo = git.Repo('.')
    latest_commit = repo.head.commit
    return file_to_check in [item.a_path for item in latest_commit.diff(None)]

def generate_token(user_type):
    try:
        if user_type == 'USER':
            user_pool_id = os.environ['COGNITO_USER_POOL_ID']
            client_id = os.environ['COGNITO_SELLER_CLIENT_ID']
            username = 'anusha.k+indyauction@7edge.com'
            password = os.environ['PASSWORD']
            print(user_pool_id, client_id, username, password)
        if user_type == 'BUYERS':
            user_pool_id = os.environ['BUYER_COGNITO_USER_POOL_ID']
            client_id = os.environ['BUYER_COGNITO_SELLER_CLIENT_ID']
            username = os.environ['BUYER_API_USERNAME']
            password = os.environ['BUYER_PASSWORD']
            print(user_pool_id, client_id, username, password)
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
        if 'AuthenticationResult' in response:
            token = response['AuthenticationResult']['IdToken']
            print("Token:buyyyywwwwwwwwww", token)
        else:
            token = response['Session']
            print(token, "usedjhewuef")
        os.environ['TOKEN'] = token
        return token

    except ClientError as e:
        print('error sadagrfyhh', e)

async def main():
    try:
        user_token = generate_token("USER")
        buyer_token = generate_token("BUYERS")

        if buyer_token and user_token:
            tokens = {
                'services/auctions': buyer_token,
                'services/users': user_token,
                'services/buyers': user_token
                # Add other service directories and their corresponding tokens here
            }

            for index, service_dir in enumerate(swagger_files):
                for service_directory, token in tokens.items():
                    if service_directory in service_dir:
                        if is_file_changed_in_latest_commit(service_dir):
                            await run_dast(service_dir, index, token)
                        break  # Break the loop after finding and using the correct token
        else:
            print("Token generation failed.")
    except Exception as e:
        print("Error in main function:", str(e))

if __name__ == '__main__':
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
