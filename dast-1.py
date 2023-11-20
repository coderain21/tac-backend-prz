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

# Initialize a boto3 session with your AWS credentials
session = boto3.Session(
    aws_access_key_id = 'AKIA5QZYLFWFE6TXB756', #os.environ.get('AWS_ACCESS_KEY_ID')
    aws_secret_access_key = '+A+0r0+n8qBJyb6cU1cvZZmtEaSJJbxeKfI314B8',#os.environ.get('AWS_SECRET_ACCESS_KEY')
    region_name = 'eu-west-2'
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
            user_pool_id = 'eu-west-2_kqcLIvA4D'#os.environ['COGNITO_USER_POOL_ID']
            client_id = '3duudq593a3j7jpp7afv1vbmuc'#os.environ['COGNITO_SELLER_CLIENT_ID']
            username = 'anusha.k+indyauction@7edge.com'#os.environ['API_USERNAME']
            password = 'Seller@123'

        if user_type == 'BUYERS':
            user_pool_id='eu-west-2_72rz6biiL'
            client_id='2r05ed12tabft8ueojtaf6hgp4'
            username='sthuthi+test@7edge.com'
            password='Sthu127'
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

        if users_token and buyers_token:
            tokens = {
                'services/auctions': buyers_token,
                'services/users': users_token,
                'services/buyers': users_token,
                'services/address-management': buyers_token
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
