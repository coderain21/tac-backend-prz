import git
import subprocess
import asyncio
import os
import boto3
from botocore.exceptions import ClientError
import sys
import argparse

# Initialize the Cognito client
client = boto3.client('cognito-idp', region_name='eu-west-2')

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

async def main(changed_files):
    try:
        users_token = await generate_cognito_token('USER')
        buyers_token = await generate_cognito_token('BUYERS')
        admin_token = await generate_cognito_token('ADMIN')

        if users_token and buyers_token and admin_token:
            tokens = {
                'services/auctions': buyers_token,
                'services/users': users_token,
                'services/buyers': users_token,
                'services/address-management': buyers_token,
                'services/access-logs': admin_token,
                'services/admin-buyer-management': admin_token,
                'services/admin-management': admin_token,
                'services/buyer-wishlist': buyers_token,
                'services/cart-management': buyers_token,
                'services/lot-bid-history': users_token,
                'services/newsletter': users_token,
                'services/order-management': users_token,
                'services/payments': buyers_token,
                'services/paypal': users_token,
                'services/quicksight-dashboards': users_token,
                'services/seller-bidder-management': users_token,
                'services/site-banner': admin_token,
                'services/subdomain': users_token
                # Add other service directories and their corresponding tokens here
            }

            for service_dir in changed_files:
                for service_directory, token in tokens.items():
                    if service_directory in service_dir:
                        await run_dast_for_swagger(service_dir, token)
                        break  # Break the loop after finding and using the correct token
        else:
            print("Token generation failed")
    except Exception as e:
        print("Error in the main function:", str(e))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run DAST for changed Swagger files.')
    parser.add_argument('changed_files', metavar='N', type=str, nargs='+', help='List of changed Swagger files')
    args = parser.parse_args()

    loop = asyncio.get_event_loop()
    loop.run_until_complete(main(args.changed_files))
