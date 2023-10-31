import git
import subprocess
import asyncio
import os
import boto3
from botocore.exceptions import ClientError
import requests
from dotenv import load_dotenv
import git  # Import the Git module

# Load environment variables from .env file
load_dotenv()

# Initialize a boto3 session with your AWS credentials
session = boto3.Session(
    region_name=os.environ['AWS_REGION'],
    aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY']
)

# Initialize the Cognito client
client = session.client('cognito-idp')

# Function to get the latest commit's SHA-1 hash
def get_latest_commit_sha():
    try:
        commit_sha = subprocess.check_output(["git", "rev-parse", "HEAD"]).strip()
        return commit_sha.decode("utf-8")
    except subprocess.CalledProcessError:
        return None

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
            user_pool_id = os.environ['COGNITO_USER_POOL_ID']
            client_id = os.environ['COGNITO_SELLER_CLIENT_ID']
            username = 'anusha.k+indyauction@7edge.com'
            password = os.environ['PASSWORD']

        if user_type == 'BUYERS':
            user_pool_id = os.environ['BUYER_COGNITO_USER_POOL_ID']
            client_id = os.environ['BUYER_COGNITO_SELLER_CLIENT_ID']
            username = os.environ['BUYER_API_USERNAME']
            password = os.environ['BUYER_PASSWORD']
        if user_pool_id is None or client_id is None or username is None or password is None:
            print("Required environment variables are not set.")
            return None

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
                'services/buyers': users_token
                # Add other service directories and their corresponding tokens here
            }

            # Get the current working directory
            current_directory = os.getcwd()
            swagger_files = find_swagger_files(current_directory)

            # Get the latest commit SHA-1 hash
            latest_commit_sha = get_latest_commit_sha()
            print(f"Latest commit SHA-1 hash: {latest_commit_sha}")

            for service_dir in swagger_files:
                # Check if the Swagger file has changed in the latest commit
                file_changed = subprocess.call(["git", "diff", "--name-only", latest_commit_sha, "--", service_dir]) == 0
                if file_changed:
                    for service_directory, token in tokens.items():
                        if service_directory in service_dir:
                            await run_dast_for_swagger(service_dir, token)
                            break  # Break the loop after finding and using the correct token
        else:
            print("Token generation failed.")
    except Exception as e:
        print("Error in main function:", str(e))

if __name__ == '__main__':
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
