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
from dotenv import load_dotenv
from boto3.session import Session

# Load environment variables
load_dotenv()

import argparse


# Setup argument parser
parser = argparse.ArgumentParser(description='Run DAST for a specific service')
parser.add_argument('-s', '--service', help='Service name to run DAST for')
args = parser.parse_args()

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


# Initialize the Cognito client
profile = os.environ['PROFILE_ENV']
session = Session(profile_name=profile)
client = session.client('cognito-idp', region_name='eu-west-2')

# Function to find Swagger files in the repository
def find_swagger_files(root_dir, specific_service=None):
    swagger_files = []

    service_dir = os.path.join(root_dir, 'services')
    for dirpath, dirnames, filenames in os.walk(service_dir):
        for filename in filenames:
            if 'swagger.json' in filename:
                path = os.path.join(dirpath, filename)
                pats = path.split('/services/')
                service_path = 'services/{0}'.format(pats[1])
                
                # If a specific service is provided, only include that service's swagger file
                if specific_service:
                    if specific_service in service_path:
                        swagger_files.append(service_path)
                else:
                    swagger_files.append(service_path)

    return swagger_files

async def run_dast_for_swagger(url, api_token):
    command = f"docker run --user=root -v $(pwd):/zap/wrk/:rw -t -e ZAP_AUTH_HEADER_VALUE='Bearer {api_token}' softwaresecurityproject/zap-stable zap-api-scan.py -t \"{url}\" -f openapi -r test_results/report.html"
    try:
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

async def run_dast_for_endpoints(swagger_path, endpoints, token):
    """
    Run DAST for specific endpoints in a Swagger file
    
    Args:
        swagger_path: Path to the full Swagger file
        endpoints: List of specific endpoints to test
        token: Authentication token to use for the test
    """
    try:
        # Create a temporary directory for endpoint-specific Swagger files
        os.makedirs('temp_swagger', exist_ok=True)
        
        # Read the original Swagger file
        with open(swagger_path, 'r') as f:
            swagger_data = json.load(f)
        
        # Create a new Swagger file with only the specified endpoints
        endpoint_swagger = swagger_data.copy()
        endpoint_swagger['paths'] = {ep: swagger_data['paths'][ep] for ep in endpoints if ep in swagger_data['paths']}
        
        # Save the endpoint-specific Swagger file
        temp_swagger_path = os.path.join('temp_swagger', f"temp_swagger_{hash(tuple(endpoints))}.json")
        with open(temp_swagger_path, 'w') as f:
            json.dump(endpoint_swagger, f)
        
        # Run DAST on the endpoint-specific Swagger file
        command = f"docker run --user=root -v $(pwd):/zap/wrk/:rw -t -e ZAP_AUTH_HEADER_VALUE='Bearer {token}' softwaresecurityproject/zap-stable zap-api-scan.py -t \"{temp_swagger_path}\" -f openapi -r test_results/report_endpoints_{hash(tuple(endpoints))}.html"
        
        process = await asyncio.create_subprocess_shell(
            command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        print(process.returncode, "process.returncode for endpoints")
        print("Command output for endpoints:")
        print(stdout.decode())
        
        # Clean up the temporary file
        os.remove(temp_swagger_path)
        
    except Exception as e:
        print(f"Error running DAST for specific endpoints: {str(e)}")
    
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

async def process_services_for_special_endpoints(swagger_files, users_token, buyers_token, admin_token):
    all_endpoints = {}
    
    # Special service handling for order-management, bids, and paypal
    for service_path in swagger_files:
        # Extract service name from path
        service_name = None
        for part in service_path.split('/'):
            if part in ['order-management', 'bids', 'paypal']:
                service_name = part
                break
        
        if not service_name:
            continue
            
        swagger_path = os.path.join(repo_path, service_path)
        
        if os.path.exists(swagger_path):
            try:
                with open(swagger_path, 'r') as f:
                    swagger_data = json.load(f)

                endpoints = list(swagger_data.get("paths", {}).keys())
                all_endpoints[service_name] = endpoints
                print(f"Endpoints for {service_name}: {endpoints}")

                # Special handling for order-management service
                if service_name == 'order-management':
                    # Split endpoints into those needing users token and those needing buyers token
                    users_endpoints = [ep for ep in endpoints if ep.startswith('/sales') or ep.startswith('/seller')]
                    buyers_endpoints = [ep for ep in endpoints if ep not in users_endpoints]
                    
                    # Run scan for /sales and /seller endpoints with users token
                    if users_endpoints:
                        print(f"Running scan for {len(users_endpoints)} /sales or /seller endpoints with users token")
                        await run_dast_for_endpoints(swagger_path, users_endpoints, users_token)
                    
                    # Run scan for other endpoints with buyers token
                    if buyers_endpoints:
                        print(f"Running scan for {len(buyers_endpoints)} other endpoints with buyers token")
                        await run_dast_for_endpoints(swagger_path, buyers_endpoints, buyers_token)

                elif service_name == 'bids':
                    users_endpoints = [ep for ep in endpoints if ep.startswith('/') or ep.startswith('/{id}')]
                    admin_endpoints = [ep for ep in endpoints if ep.startswith('admin/{id}')]
                    
                    # Correct logic: buyers_endpoints should exclude both users and admin endpoints
                    buyers_endpoints = [
                        ep for ep in endpoints 
                        if ep not in users_endpoints and ep not in admin_endpoints
                    ]

                    # Run scan for "/" or "/{id}" endpoints with users token
                    if users_endpoints:
                        print(f"Running scan for {len(users_endpoints)} '/' or '/{{id}}' endpoints with users token")
                        await run_dast_for_endpoints(swagger_path, users_endpoints, users_token)

                    # Run scan for other endpoints with buyers token
                    if buyers_endpoints:
                        print(f"Running scan for {len(buyers_endpoints)} buyer endpoints with buyers token")
                        await run_dast_for_endpoints(swagger_path, buyers_endpoints, buyers_token)

                    # Run scan for admin endpoints with admin token
                    if admin_endpoints:
                        print(f"Running scan for {len(admin_endpoints)} admin endpoints with admin token")
                        await run_dast_for_endpoints(swagger_path, admin_endpoints, admin_token)
                
                elif service_name == 'paypal':
                    users_endpoints = [ep for ep in endpoints if ep.startswith('/paypal-connect') or ep.startswith('/paypal-disconnect')]
                    buyers_endpoints = [ep for ep in endpoints if ep not in users_endpoints]
                    
                    # Run scan for paypal-connect or paypal-disconnect endpoints with users token
                    if users_endpoints:
                        print(f"Running scan for {len(users_endpoints)} /paypal-connect or /paypal-disconnect endpoints with users token")
                        await run_dast_for_endpoints(swagger_path, users_endpoints, users_token)
                    
                    # Run scan for other endpoints with buyers token
                    if buyers_endpoints:
                        print(f"Running scan for {len(buyers_endpoints)} other endpoints with buyers token")
                        await run_dast_for_endpoints(swagger_path, buyers_endpoints, buyers_token)
                        
            except Exception as e:
                print(f"Error processing swagger file {swagger_path}: {str(e)}")

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
                'auctions': users_token,
                'address-management': buyers_token,
                'access-logs': admin_token,
                'admin-management': admin_token
                # 'buyer-wishlist': buyers_token,
                # 'cart-management': buyers_token,
                # 'lot-bid-history': users_token,
                # 'newsletter': users_token,
                # 'order-management': users_token,  # Default token, will be handled specially
                # 'payments': buyers_token,
                # 'paypal': users_token,  # Default token, will be handled specially
                # 'quicksight-dashboards': users_token,
                # 'seller-bidder-management': users_token,
                # 'site-banner': admin_token,
                # 'subdomain': users_token,
                # 'bids': buyers_token  # Default token, will be handled specially
            }

            # Find swagger files - if a specific service is provided, only get that service's files
            swagger_files = find_swagger_files(repo_path, args.service)
            print("Swagger files to process:", swagger_files)
            
            # Handle special services separately for endpoint-specific token selection
            special_services = ['order-management', 'bids', 'paypal']
            special_service_files = [f for f in swagger_files if any(service in f for service in special_services)]
            regular_service_files = [f for f in swagger_files if not any(service in f for service in special_services)]
            
            # Process special services with endpoint-specific logic
            if special_service_files:
                await process_services_for_special_endpoints(special_service_files, users_token, buyers_token, admin_token)
            
            # Process regular services with standard token selection
            for service_path in regular_service_files:
                # Determine which token to use based on service name
                token_to_use = None
                for service_name, token in tokens.items():
                    if service_name in service_path:
                        token_to_use = token
                        break
                
                if token_to_use:
                    # If run without service flag or with matching service flag
                    if not args.service or args.service in service_path:
                        await run_dast_for_swagger(service_path, token_to_use)
                else:
                    print(f"No token configuration found for service: {service_path}")
            
            # The following code has been commented out as requested
            # # Collect the list of changed files using git show
            # changed_files = []
            # for parent_sha in parent_commit_shas:
            #     try:
            #         parent_changed_files_output = subprocess.check_output(['git', 'show', '--name-only', parent_sha], text=True)
            #         parent_changed_files = parent_changed_files_output.strip().split('\n')
            #         print(parent_changed_files_output,'parent changes files output')
            #         changed_files.extend(parent_changed_files)
            #     except subprocess.CalledProcessError as e:
            #         print(f"Error when running 'git show' for {parent_sha}:", e)
            # swagger_files = [file for file in changed_files if file.endswith('.json') and 'swagger' in file]
            # print("Swagger files:")
            # print(swagger_files)
            # for service_dir in find_swagger_files(repo_path):
            #     # Check if the Swagger file has changed in the latest commit
            #     if any(service_dir in changed_file for changed_file in changed_files):
            #         for service_directory, token in tokens.items():
            #             if service_directory in service_dir:
            #                 await run_dast_for_swagger(service_dir, token)
            #                 break  # Break the loop after finding and using the correct token
            
        else:
            print("Token generation failed")
    except Exception as e:
        print("Error in the main function:", str(e))

if __name__ == '__main__':
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())