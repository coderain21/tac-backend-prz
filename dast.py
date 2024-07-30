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
            user_pool_id = 'your_seller_cognito_userpool_id'
            client_id = 'your_seller_cognito_client_id'
            username = 'your_api_username'
            password = 'your_password'
        elif user_type == 'BUYERS':
            user_pool_id = 'your_buyer_cognito_userpool_id'
            client_id = 'your_buyer_cognito_client_id'
            username = 'your_buyer_api_username'
            password = 'your_buyer_password'
        elif user_type == 'ADMIN':
            user_pool_id = 'your_admin_cognito_userpool_id'
            client_id = 'your_admin_cognito_client_id'
            username = 'your_admin_username'
            password = 'your_admin_password'
        else:
            print("Invalid user type specified.")
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

            for changed_file in changed_files:
                service_directory = changed_file.split('/')[0]
                if service_directory in tokens:
                    await run_dast_for_swagger(changed_file, tokens[service_directory])
                else:
                    print(f"No token found for service directory: {service_directory}")
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
