import git
import subprocess
import asyncio
import os
import boto3
from botocore.exceptions import ClientError

# Determine the repository path using pathlib
repo_path = git.Repo('.', search_parent_directories=True).working_tree_dir
print(repo_path, 'repo path')

# Create a Git repository object
repo = git.Repo(repo_path)

# Get the name of the current branch
current_branch = repo.active_branch.name
print(f"Current branch: {current_branch}")

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

            # Get the list of commits unique to the current branch
            base_branch = repo.merge_base(current_branch, 'origin/main')[0]
            commits = list(repo.iter_commits(f'{base_branch.hexsha}..HEAD'))

            # Print the commits of the current branch
            print(f"Commits in branch {current_branch}:")
            for commit in commits:
                print(f"Commit: {commit.hexsha}\nMessage: {commit.message}\n")

            swagger_files = []
            for commit in commits:
                try:
                    changed_files_output = subprocess.check_output(['git', 'show', '--name-only', commit.hexsha], text=True)
                    changed_files = changed_files_output.strip().split('\n')
                    print(f"Commit: {commit.hexsha}\nChanged files: {changed_files}\n")
                    swagger_files.extend([file for file in changed_files if file.endswith('.json') and 'swagger' in file])
                except subprocess.CalledProcessError as e:
                    print(f"Error when running 'git show' for {commit.hexsha}:", e)

            swagger_files = list(set(swagger_files))  # Remove duplicates
            print("Swagger files:")
            print(swagger_files)
        #     for service_dir in find_swagger_files(repo_path):
        #         if any(service_dir in changed_file for changed_file in swagger_files):
        #             for service_directory, token in tokens.items():
        #                 if service_directory in service_dir:
        #                     await run_dast_for_swagger(service_dir, token)
        #                     break  # Break the loop after finding and using the correct token
        else:
            print("Token generation failed")
    except Exception as e:
        print("Error in the main function:", str(e))

if __name__ == '__main__':
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
