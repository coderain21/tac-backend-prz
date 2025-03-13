'''this api will update the subdomain for the seller'''
import json
import os
from pymongo import MongoClient
import boto3
from pymongo.errors import OperationFailure

amplify_client = boto3.client('amplify',region_name= 'eu-west-2')

cognito_client = boto3.client('cognito-idp')

headers = {
    'Content-Type': 'application/json', 
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


# Create MongoDB client with session support
client = MongoClient(
                os.environ['MONGO_CLIENT'],
                maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                )
db = client[os.environ['DATABASE']]
subdomain_collection = db[os.environ['SUBDOMAIN_COLLECTION']]
seller_collection = db[os.environ['SELLERS_TABLE']]
userpoolid = os.environ['DEFAULT_BUYER_USERPOOL_ID']
userclientid = os.environ['BUYER_COGNITO_CLIENT_ID'] 
userclientname = 'default-client'

def create_app_client(userpoolid,client_name,subdomain):
    callback_url=[f"https://{subdomain}.{os.environ.get('AMPLIFY_DOMAIN_NAME')}"]
    if os.environ.get("STAGE")=="dev":
        callback_url.append('http://localhost:3000/register')
    response = cognito_client.create_user_pool_client(
        UserPoolId=userpoolid,
        ClientName=client_name,
        GenerateSecret=False,
        TokenValidityUnits={
        'AccessToken': 'minutes',
        'IdToken': 'minutes',
        'RefreshToken': 'days'
        },
        ExplicitAuthFlows=[
        'ALLOW_ADMIN_USER_PASSWORD_AUTH','ALLOW_CUSTOM_AUTH','ALLOW_USER_PASSWORD_AUTH','ALLOW_USER_SRP_AUTH','ALLOW_REFRESH_TOKEN_AUTH'
        ],
        AccessTokenValidity=60,
        IdTokenValidity=60,
        RefreshTokenValidity=30,
        CallbackURLs=[
        'http://localhost:3000/','http://localhost:3000/register','http://localhost:3000/login',f'https://{subdomain}.{os.environ.get("AMPLIFY_DOMAIN_NAME")}/',f'https://{subdomain}.{os.environ.get("AMPLIFY_DOMAIN_NAME")}/register',f'https://{subdomain}.{os.environ.get("AMPLIFY_DOMAIN_NAME")}/login'
        ],
        LogoutURLs=[
            'http://localhost:3000/','http://localhost:3000/register','http://localhost:3000/login',f'https://{subdomain}.{os.environ.get("AMPLIFY_DOMAIN_NAME")}/',f'https://{subdomain}.{os.environ.get("AMPLIFY_DOMAIN_NAME")}/register',f'https://{subdomain}.{os.environ.get("AMPLIFY_DOMAIN_NAME")}/login'
        ],
        SupportedIdentityProviders=[
        'COGNITO','Facebook','Google'
        ],
        AllowedOAuthFlows=[
        'code','implicit'
         ],
        AllowedOAuthScopes=[
            'phone','email','openid','profile','aws.cognito.signin.user.admin'
        ],
        AllowedOAuthFlowsUserPoolClient=True
    )
    return response






'''
This function updates the subdomain for a seller in the system. Here's what it does:

1. Validates the request:
   - Checks if the user is authenticated and has seller permissions
   - Verifies the request contains required subdomain parameter
   - Confirms seller has Pro plan access

2. Handles view-only requests:
   - If view=True parameter is passed, returns existing subdomain for seller

3. Manages AWS Amplify domain configuration:
   - Gets current domain associations
   - Validates subdomain availability
   - Updates domain mappings:
     - Removes old subdomain if exists
     - Adds new subdomain mapping

4. Updates Cognito app client:
   - Updates callback/logout URLs for new subdomain
   - Maintains existing URL configurations
   - Adds localhost URLs in dev environment

5. Updates database records:
   - Updates subdomain collection with new subdomain
   - Sets default flag to false

6. Handles DNS records (in production):
   - Assumes cross-account role for Route53 access
   - Creates/updates CNAME record for new subdomain
   - Removes old subdomain DNS record if exists

7. Uses MongoDB transactions to ensure data consistency
   - Rolls back changes if any step fails
   - Commits transaction only when all operations succeed

8. Error handling:
   - Handles various AWS service errors
   - Manages database operation failures
   - Returns appropriate error responses with status codes

Parameters:
- event: API Gateway event object containing request details
- context: Lambda context object

Returns:
- API response with status code, headers and message
'''
def update_app_client(userpoolid, client_id, client_name, subdomain, existing_domain_record):
    # Get existing user pool client configuration
    get_userpool = cognito_client.describe_user_pool_client(
        UserPoolId=userpoolid,
        ClientId=client_id
    )
    # Extract current callback URLs
    callbackUrlArray = get_userpool['UserPoolClient']['CallbackURLs']

    # Create array of new callback URLs for the new subdomain
    new_callback_urls = [
        f"https://{subdomain}.{os.environ.get('AMPLIFY_DOMAIN_NAME')}",
        f"https://{subdomain}.{os.environ.get('AMPLIFY_DOMAIN_NAME')}/register", 
        f"https://{subdomain}.{os.environ.get('AMPLIFY_DOMAIN_NAME')}/login"
    ]
    # Add new callback URLs to existing array
    callbackUrlArray.extend(new_callback_urls)

    # Remove old subdomain URLs if not using default subdomain
    if existing_domain_record['subdomain'] != os.environ['DEFAULT_SUB_DOMAIN']:
        # Filter out URLs containing the old subdomain
        callbackUrlArray = [url for url in callbackUrlArray if existing_domain_record['subdomain'] not in url]

    # Add localhost URL for dev environment
    if os.environ.get("STAGE") == "dev":
        callbackUrlArray.append('http://localhost:3000/register')

    # Update the Cognito user pool client with new configuration
    response = cognito_client.update_user_pool_client(
        UserPoolId=userpoolid,
        ClientId=client_id,
        ClientName=client_name,
        TokenValidityUnits={
            'AccessToken': 'minutes',
            'IdToken': 'minutes',
            'RefreshToken': 'days'
        },
        ExplicitAuthFlows=[
            'ALLOW_ADMIN_USER_PASSWORD_AUTH', 'ALLOW_CUSTOM_AUTH', 'ALLOW_USER_PASSWORD_AUTH', 'ALLOW_USER_SRP_AUTH',
            'ALLOW_REFRESH_TOKEN_AUTH'
        ],
        AccessTokenValidity=60,
        IdTokenValidity=60,
        RefreshTokenValidity=30,
        CallbackURLs=callbackUrlArray,  # Use the modified callback_url list
        LogoutURLs=callbackUrlArray,  # Use the modified callback_url list
        SupportedIdentityProviders=[
            'COGNITO', 'Facebook', 'Google'
        ],
        AllowedOAuthFlows=[
            'code', 'implicit'
        ],
        AllowedOAuthScopes=[
            'phone', 'email', 'openid', 'profile', 'aws.cognito.signin.user.admin'
        ],
        AllowedOAuthFlowsUserPoolClient=True
    )
    return response

'''
This function creates a new Cognito user pool client with specified settings.

Parameters:
- userpoolid: ID of the Cognito user pool
- client_name: Name for the new client app
- subdomain: Subdomain to use for callback/logout URLs

Returns:
- Response from Cognito create_user_pool_client API call

The function:
1. Sets up callback URLs using the provided subdomain
2. Adds localhost URLs in dev environment
3. Configures client settings including:
   - Token validity periods
   - Auth flows
   - OAuth settings
   - Identity providers
   - Callback/logout URLs
4. Creates the client with specified configuration
'''
def subdomain(event, context):
    # Main function to handle subdomain updates for sellers
    try:
        print('Event', event)
        # Get seller email from Cognito claims
        seller_email = event['requestContext']['authorizer']['claims']['email']

        # Check if user has seller permissions
        if "cognito:groups" in event['requestContext']['authorizer']['claims'] and 'seller' not in event['requestContext']['authorizer']['claims']["cognito:groups"]:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        data = event['queryStringParameters']

        # Start MongoDB transaction for atomic operations
        with client.start_session() as session:
            with session.start_transaction():
                # Get existing domain record for seller
                existing_domain_record = subdomain_collection.find_one({"seller_email": seller_email}, session=session)

                # Handle view-only requests
                if data and 'view' in data and data['view'] == 'True':
                    subdomain = existing_domain_record.get('subdomain')
                    return {
                        'statusCode': 200,
                        'headers': headers,
                        'body': json.dumps({'subdomain': subdomain})
                    }

                # Parse and validate request body
                request_body = json.loads(event['body'])
                if not request_body['subdomain']:
                    return {
                        'statusCode': 404,
                        'headers': headers,
                        'body': json.dumps({'message': 'Please provide subdomain'})
                    }

                new_subdomain = request_body['subdomain']

                # Check if seller has Pro plan access
                plan = seller_collection.find_one({'email_address': seller_email}, session=session)['plan_type']

                if plan != 'Pro':
                    return {
                        'statusCode': 404,
                        'headers': headers,
                        'body': json.dumps({'message': "Please upgrade your plan"})
                    }

                # Get current Amplify domain associations
                try:
                    response = amplify_client.get_domain_association(
                                appId=os.environ['AMPLIFY_APP_ID'],
                                domainName=os.environ['AMPLIFY_DOMAIN_NAME']
                            )
                except Exception as e:
                    print('Error in get domain association', e)
                    session.abort_transaction()
                    return {
                        'statusCode': 400,
                        'headers': headers,
                        'body': json.dumps({'Error in Domain association': str(e)})
                    }

                # Extract DNS record for CNAME mapping
                dns_record = None
                if len(response['domainAssociation']['subDomains'])>0:
                    dns_record = response['domainAssociation']['subDomains'][0]['dnsRecord'].split(' ')[2]

                # Check if requested subdomain already exists
                existing_subdomains = [domain['subDomainSetting'] for domain in response['domainAssociation']['subDomains']]
                subdomain_exists = new_subdomain in [domain['prefix'] for domain in existing_subdomains]

                if subdomain_exists:
                    session.abort_transaction()
                    return {
                        'statusCode': 404,
                        'headers': headers,
                        'body': json.dumps({'message': 'Subdomain already exists'})
                    }

                # Prepare domain mapping updates
                remove_old = False
                update_mapping = []
                for domain in existing_subdomains:
                    if domain['prefix'] != os.environ['DEFAULT_SUB_DOMAIN'] and domain['prefix'] == existing_domain_record['subdomain']:
                        print("Removing old subdomain - new subdomain ", domain['prefix'], "default subdomain", os.environ['DEFAULT_SUB_DOMAIN'] , "existing subdomain" , existing_domain_record['subdomain'])
                        remove_old = True
                    else:
                        update_mapping.append(domain)

                print('update_mapping', update_mapping)
                update_mapping.append({'prefix': new_subdomain, 'branchName': os.environ["AMPLIFY_BRANCH"]})

                # Update Cognito app client with new subdomain URLs
                try:
                    update_app_client(userpoolid, userclientid, userclientname, new_subdomain,existing_domain_record)
                except Exception as e:
                    print('Error in update app client call:', str(e))
                    session.abort_transaction()
                    return {
                        'statusCode': 400,
                        'headers': headers,
                        'body': json.dumps({'Error updating app client': str(e)})
                             }

                # Update subdomain record in MongoDB
                subdomain_collection.update_one(
                    {'seller_email': seller_email},
                    {"$set": {'subdomain': new_subdomain, "default": False}},
                    session=session
                )

                # Update Amplify domain association with new mapping
                try:
                    response = amplify_client.update_domain_association(
                        appId=os.environ['AMPLIFY_APP_ID'],
                        domainName=os.environ['AMPLIFY_DOMAIN_NAME'],
                        enableAutoSubDomain=True,
                        subDomainSettings=update_mapping
                    )
                except Exception as e:
                    print('Error in update domain association', e)
                    session.abort_transaction()
                    return {
                        'statusCode': 400,
                        'headers': headers,
                        'body': json.dumps({'Error in Update Domain association': str(e)})
                    }

                # Handle Route53 DNS records in production
                if(os.environ.get('STAGE')) == 'prod':
                    # Assume cross-account role for Route53 access
                    sts_client = boto3.client('sts')
                    assumed_role_object = sts_client.assume_role(
                        RoleArn=os.environ.get('CROSS_ACCOUNT_ARN'),
                        RoleSessionName="AssumeRoleSession1"
                    )
                    credentials = assumed_role_object['Credentials']
                    route53_client = boto3.client(
                        'route53',
                        aws_access_key_id=credentials['AccessKeyId'],
                        aws_secret_access_key=credentials['SecretAccessKey'],
                        aws_session_token=credentials['SessionToken']
                    )

                    # Prepare Route53 record details
                    hosted_zone_id = os.environ.get('HOSTED_ZONE_ID')
                    record_name = f"{new_subdomain}.{os.environ.get('AMPLIFY_DOMAIN_NAME')}"
                    record_type = 'CNAME'
                    record_value = dns_record

                    # Create change batch for DNS updates
                    change_batch = {
                        'Changes': [
                            {
                                'Action': 'UPSERT',
                                'ResourceRecordSet': {
                                    'Name': record_name,
                                    'Type': record_type,
                                    'TTL': 300,
                                    'ResourceRecords': [
                                        {
                                            'Value': record_value
                                        }
                                    ]
                                }
                            }
                        ]
                    }

                    # Add deletion of old DNS record if needed
                    if remove_old is True:
                        change_batch['Changes'].append(
                            {
                                'Action': 'DELETE',
                                'ResourceRecordSet': {
                                    'Name': f"{existing_domain_record['subdomain']}.{os.environ.get('AMPLIFY_DOMAIN_NAME')}",
                                    'Type': record_type,
                                    'TTL': 300,
                                    'ResourceRecords': [
                                        {
                                            'Value': record_value
                                        }
                                    ]
                                }
                            }
                        )

                    # Apply DNS changes
                    try:
                        response1 = route53_client.change_resource_record_sets(
                            HostedZoneId=hosted_zone_id,
                            ChangeBatch=change_batch
                        )
                    except Exception as err:
                        print('Error in route53 client',str(err))
                        session.abort_transaction()
                        return {
                            'statusCode': 500,
                            'headers': headers,
                            'body': json.dumps({'message': "Internal server error"})
                        }

                # Commit transaction if everything succeeded
                session.commit_transaction()

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({"message": "Subdomain updated"})
        }

    # Handle MongoDB operation failures
    except OperationFailure as e:
        print('MongoDB Operation Failure:', str(e))
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': "Database transaction failed"})
        }

    # Handle any other errors
    except Exception as err:
        print('Internal Server Error',str(err))
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': "Internal server error"})
        }
