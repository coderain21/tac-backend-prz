import pathlib
import git
import subprocess
import asyncio
import os
import boto3
from botocore.exceptions import ClientError
import requests
import json
import datetime
import jwt

# Determine the repository path using pathlib
repo_path = git.Repo('.', search_parent_directories=True).working_tree_dir
print(repo_path, 'repo path')

# Create a Git repository object
repo = git.Repo(repo_path)

# Get the last commit SHA
last_commit_sha = repo.head.commit.hexsha
print(last_commit_sha, 'last commit')

# Get the parent commit SHAs of the last commit
parent_commit_shas = [parent.hexsha for parent in repo.commit(last_commit_sha).parents]
print("Parent commit SHAs:", parent_commit_shas)
aws_access_key_id = os.environ['AWS_ACCESS_KEY_ID']
aws_secret_access_key = os.environ['AWS_SECRET_ACCESS_KEY']
region = os.environ['AWS_REGION']

# Initialize a boto3 session with your AWS credentials
session = boto3.Session(
    aws_access_key_id = aws_access_key_id, #os.environ.get('AWS_ACCESS_KEY_ID')
    aws_secret_access_key = aws_secret_access_key,#os.environ.get('AWS_SECRET_ACCESS_KEY')
    region_name = region
)

# Initialize the Cognito client
client = session.client('cognito-idp')

# Function to find Swagger files in the repository
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

async def run_dast_for_swagger(url, api_token):
    command = f"docker run -v $(pwd):/zap/wrk/:rw -t -e ZAP_AUTH_HEADER_VALUE='Bearer {api_token}' softwaresecurityproject/zap-stable zap-api-scan.py -t '{url}' -f openapi -r test_results/report.html"
    try:
        print(command)
        process = await asyncio.create_subprocess_shell(
            command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        print(process.returncode, "process.returncode")
        print("Command output:")
        print(stdout.decode())
    except asyncio.CancelledError:
        process.terminate()
        raise
    return None


async def generate_cognito_token(user_type):
    try:
        
        if user_type == 'USER':
            print("here")
            user_pool_id = os.environ['SELLER_COGNITO_USERPOOL_ID']
            client_id = os.environ['SELLER_COGNITO_CLIENT_ID']
            username = os.environ['API_USERNAME']
            password = os.environ['PASSWORD']
        elif user_type == 'BUYERS':
            user_pool_id = os.environ['BUYER_COGNITO_USERPOOL_ID']
            client_id = os.environ['BUYER_COGNITO_CLIENT_ID']
            username = os.environ['BUYER_API_USERNAME']
            password = os.environ['BUYER_PASSWORD']
        elif user_type == 'ADMIN':
            user_pool_id = os.environ['ADMIN_COGNITO_USERPOOL_ID']
            client_id = os.environ['ADMIN_COGNITO_CLIENT_ID']
            username = os.environ['ADMIN_USERNAME']
            password = os.environ['ADMIN_PASSWORD']
        else:
            print("Invalid user type specified.")
            return

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
            
        else:
            token = response['Session']

        os.environ['TOKEN'] = token
        return token
    except ClientError as e:
        print(e)

    return None

async def main():
    try:
        users_token = await generate_cognito_token('USER')
        buyers_token = await generate_cognito_token('BUYERS')
        admin_token = await generate_cognito_token('ADMIN')

        if users_token and buyers_token and admin_token:
            tokens = {
                'admin-buyer-management': admin_token,
                'users': users_token,
                'buyers': users_token,
                'address-management': buyers_token,
                'access-logs': admin_token,
                'admin-management': admin_token,
                'buyer-wishlist': buyers_token,
                'cart-management': buyers_token,
                'lot-bid-history': users_token,
                'newsletter': users_token,
                'order-management': users_token,
                'payments': buyers_token,
                'paypal': users_token,
                'quicksight-dashboards': users_token,
                'seller-bidder-management': users_token,
                'site-banner': admin_token,
                'subdomain': users_token
                # Add other service directories and their corresponding tokens here
            }

            # Collect the list of changed files using git show
            changed_files = []
            for parent_sha in parent_commit_shas:
                try:
                    parent_changed_files_output = subprocess.check_output(['git', 'show', '--name-only', parent_sha], text=True)
                    parent_changed_files = parent_changed_files_output.strip().split('\n')
                    print(parent_changed_files_output,'parent changes files output')
                    changed_files.extend(parent_changed_files)
                except subprocess.CalledProcessError as e:
                    print(f"Error when running 'git show' for {parent_sha}:", e)
            swagger_files = [file for file in changed_files if file.endswith('.json') and 'swagger' in file]
            print("Swagger files:")
            print(swagger_files)
            for service_dir in find_swagger_files(repo_path):
                # Check if the Swagger file has changed in the latest commit
                if any(service_dir in changed_file for changed_file in changed_files):
                    for service_directory, token in tokens.items():
                        if service_directory in service_dir:
                            await run_dast_for_swagger(service_dir, token)
                            break  # Break the loop after finding and using the correct token
        # else:
        #     print("Token generation failed")
    except Exception as e:
        print("Error in the main function:", str(e))

if __name__ == '__main__':
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
