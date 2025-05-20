import argparse
import pathlib
import git
import subprocess
import asyncio
import os
import json
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from boto3.session import Session

# Load environment variables
load_dotenv()

# Argument parser
parser = argparse.ArgumentParser(description="Run DAST scan for Swagger APIs.")
parser.add_argument('-s', '--service', type=str, help='Run scan for a specific service only (e.g. access-logs)')
args = parser.parse_args()

# Determine the repository path using pathlib
repo_path = git.Repo('.', search_parent_directories=True).working_tree_dir
print(repo_path, 'repo path')

# Create a Git repository object
repo = git.Repo(repo_path)

# Get the last commit SHA and its parent(s)
last_commit_sha = repo.head.commit.hexsha
print(last_commit_sha, 'last commit')
parent_commit_shas = [parent.hexsha for parent in repo.commit(last_commit_sha).parents]
print("Parent commit SHAs:", parent_commit_shas)

# Initialize the Cognito client with AWS profile
profile = 'indyauction-dev'
session = Session(profile_name=profile)
client = session.client('cognito-idp', region_name='eu-west-2')

# Find Swagger files
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

# Run DAST scan for specific endpoints from a Swagger file
async def run_dast_for_endpoints(swagger_path, endpoints, api_token):
    # Create a temporary Swagger file containing only the selected endpoints
    with open(swagger_path, 'r') as f:
        swagger_data = json.load(f)
    
    # Create a copy of the Swagger data with only the specified endpoints
    filtered_swagger = swagger_data.copy()
    filtered_paths = {}
    for endpoint in endpoints:
        if endpoint in swagger_data.get("paths", {}):
            filtered_paths[endpoint] = swagger_data["paths"][endpoint]
    
    if not filtered_paths:
        print(f"No matching endpoints found for filter")
        return
    
    filtered_swagger["paths"] = filtered_paths
    
    # Create a temporary file for the filtered Swagger
    temp_file = f"temp_{os.path.basename(swagger_path)}"
    with open(temp_file, 'w') as f:
        json.dump(filtered_swagger, f)
    
    # Run DAST on the temporary file
    command = f"docker run --user=root -v $(pwd):/zap/wrk/:rw -t -e ZAP_AUTH_HEADER_VALUE='Bearer {api_token}' softwaresecurityproject/zap-stable zap-api-scan.py -t \"{temp_file}\" -f openapi -r test_results/report_{os.path.basename(temp_file)}.html"
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
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file):
            os.remove(temp_file)

# Run DAST scan
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

# Generate Cognito tokens
async def generate_cognito_token(user_type):
    try:
        if user_type == 'USER':
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
        token = response.get('AuthenticationResult', {}).get('IdToken') or response.get('Session')
        os.environ['TOKEN'] = token
        return token
    except ClientError as e:
        print(e)
        return None

# Main execution
async def main():
    try:
        users_token = await generate_cognito_token('USER')
        buyers_token = await generate_cognito_token('BUYERS')
        admin_token = await generate_cognito_token('ADMIN')

        if not all([users_token, buyers_token, admin_token]):
            print("Token generation failed.")
            return

        tokens = {
            # 'admin-buyer-management': admin_token,
            # 'users': users_token,
            # 'buyers': users_token,
            # 'auctions': users_token,
            # 'address-management': buyers_token,
            # 'access-logs': admin_token,
            # 'admin-management': admin_token,
            # 'buyer-wishlist': buyers_token,
            # 'cart-management': buyers_token,
            # 'lot-bid-history': users_token,
            # 'newsletter': users_token,
            'order-management': {
                'default': buyers_token,
                '/sales': users_token,
                '/seller': users_token
            },
            'payments': buyers_token,
            'paypal': users_token,
            'quicksight-dashboards': users_token,
            'seller-bidder-management': users_token,
            'site-banner': admin_token,
            'subdomain': users_token,
            'bids': buyers_token
        }

        # Print git changed files (for debugging/audit)
        for parent_sha in parent_commit_shas:
            try:
                parent_changed_files_output = subprocess.check_output(
                    ['git', 'show', '--name-only', parent_sha], text=True)
                print(parent_changed_files_output, 'parent changes files output')
            except subprocess.CalledProcessError as e:
                print(f"Error running git show for {parent_sha}:", e)

        # Find Swagger files
        swagger_files = find_swagger_files(repo_path)
        all_endpoints = {}  # Dictionary to store endpoints per service

        # If specific service is provided, run only that
        if args.service:
            matched = False
            for swagger_path in swagger_files:
                if args.service in swagger_path:
                    matched = True
                    token_info = tokens.get(args.service)
                    if token_info:
                        # Load swagger and extract paths
                        with open(swagger_path, 'r') as f:
                            swagger_data = json.load(f)

                        endpoints = list(swagger_data.get("paths", {}).keys())
                        all_endpoints[args.service] = endpoints
                        print(f"Endpoints for {args.service}: {endpoints}")

                        # Special handling for order-management service
                        if args.service == 'order-management':
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

                        elif args.service == 'bids':
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
                        
                        elif args.service == 'paypal':
                            users_endpoints = [ep for ep in endpoints if ep.startswith('/paypal-connect') or ep.startswith('/paypal-disconnect')]
                            buyers_endpoints = [ep for ep in endpoints if ep not in users_endpoints]
                            
                            # Run scan for /sales and /seller endpoints with users token
                            if users_endpoints:
                                print(f"Running scan for {len(users_endpoints)} /paypal-connect or /paypal-disconnect endpoints with users token")
                                await run_dast_for_endpoints(swagger_path, users_endpoints, users_token)
                            
                            # Run scan for other endpoints with buyers token
                            if buyers_endpoints:
                                print(f"Running scan for {len(buyers_endpoints)} other endpoints with buyers token")
                                await run_dast_for_endpoints(swagger_path, buyers_endpoints, buyers_token)

                        else:
                            # For other services, use the existing token selection logic
                            if isinstance(token_info, dict):
                                # For dictionaries, use the default token (we'll run scan once per service)
                                token = token_info.get('default')
                            else:
                                token = token_info

                            if token:
                                print(f"Running scan for service {args.service}")
                                await run_dast_for_swagger(swagger_path, token)
                            else:
                                print(f"No token found for service '{args.service}'")
                    else:
                        print(f"No token found for service '{args.service}'")
                    break
            if not matched:
                print(f"No Swagger file found for service '{args.service}'")
        else:
            # Run for all services
            for swagger_path in swagger_files:
                service_name = None
                for service_directory in tokens.keys():
                    if service_directory in swagger_path:
                        service_name = service_directory
                        break
                
                if service_name:
                    token_info = tokens.get(service_name)
                    
                    # Load swagger to get endpoints
                    try:
                        with open(swagger_path, 'r') as f:
                            swagger_data = json.load(f)
                        endpoints = list(swagger_data.get("paths", {}).keys())
                    except Exception as e:
                        print(f"Error loading swagger file {swagger_path}: {str(e)}")
                        continue
                    
                    if service_name == 'bids':
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

                    elif service_name == 'order-management':
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
                    

                    elif service_name == 'paypal':
                        # Split endpoints into those needing users token and those needing buyers token
                        users_endpoints = [ep for ep in endpoints if ep.startswith('/paypal-connect') or ep.startswith('/paypal-disconnect')]
                        buyers_endpoints = [ep for ep in endpoints if ep not in users_endpoints]
                        
                        # Run scan for /sales and /seller endpoints with users token
                        if users_endpoints:
                            print(f"Running scan for {len(users_endpoints)} /paypal-connect or /paypal-disconnect endpoints with users token")
                            await run_dast_for_endpoints(swagger_path, users_endpoints, users_token)
                        
                        # Run scan for other endpoints with buyers token
                        if buyers_endpoints:
                            print(f"Running scan for {len(buyers_endpoints)} other endpoints with buyers token")
                            await run_dast_for_endpoints(swagger_path, buyers_endpoints, buyers_token)
                    
                    else:
                        # Normal case - use token directly or from dictionary
                        if isinstance(token_info, dict):
                            token = token_info.get('default')
                        else:
                            token = token_info
                        await run_dast_for_swagger(swagger_path, token)

    except Exception as e:
        print("Error in the main function:", str(e))

if __name__ == '__main__':
    asyncio.run(main())