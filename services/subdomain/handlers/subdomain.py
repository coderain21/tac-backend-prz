'''this api will update the subdomain for the seller''' 
import json
import os
from pymongo import MongoClient
import boto3
access_key=os.environ.get('AWS_MAIN_ACCESS_KEY_ID')
secret_key=os.environ.get('AWS_MAIN_SECRET_ACCESS_KEY')
amplify_client = boto3.client('amplify',region_name= 'eu-west-2', aws_access_key_id=access_key, aws_secret_access_key=secret_key)

cognito_client = boto3.client('cognito-idp')

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}
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
        AccessTokenValidity=5,
        IdTokenValidity=5,
        RefreshTokenValidity=3650,
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

def update_app_client(userpoolid,client_id,client_name,subdomain):
    callback_url=[f"https://{subdomain}.{os.environ.get('AMPLIFY_DOMAIN_NAME')}"]
    if os.environ.get("STAGE")=="dev":
        callback_url.append('http://localhost:3000/register')
    response = cognito_client.update_user_pool_client(
        UserPoolId=userpoolid,
        ClientId= client_id,
        ClientName=client_name,
        TokenValidityUnits={
        'AccessToken': 'minutes',
        'IdToken': 'minutes',
        'RefreshToken': 'days'
        },
        ExplicitAuthFlows=[
        'ALLOW_ADMIN_USER_PASSWORD_AUTH','ALLOW_CUSTOM_AUTH','ALLOW_USER_PASSWORD_AUTH','ALLOW_USER_SRP_AUTH','ALLOW_REFRESH_TOKEN_AUTH'
        ],
        AccessTokenValidity=5,
        IdTokenValidity=5,
        RefreshTokenValidity=3650,
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


def subdomain(event, context):
    try:
        print(event)
        seller_email = event['requestContext']['authorizer']['claims']['email']
        if "cognito:groups" in event['requestContext']['authorizer']['claims'] and 'seller' not in event['requestContext']['authorizer']['claims']["cognito:groups"]:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        subdomain_collection = db[os.environ['SUBDOMAIN_COLLECTION']]
        data = event['queryStringParameters']
        seller_collection = db[os.environ['SELLERS_TABLE']]
        existing_domain_record = subdomain_collection.find_one({"seller_email": seller_email})

        if data and 'view' in data and data['view'] == 'True':
            subdomain = existing_domain_record.get('subdomain')
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'subdomain': subdomain})
            }

        request_body = json.loads(event['body'])
        new_subdomain = request_body['subdomain']
        plan = seller_collection.find_one({'email_address': seller_email})['plan_type']

        if plan != 'Pro':
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'message': "Please upgrade your plan"})
            }

        response = amplify_client.get_domain_association(
            appId=os.environ['AMPLIFY_APP_ID'],
            domainName=os.environ['AMPLIFY_DOMAIN_NAME']
        )
        existing_subdomains = [domain['subDomainSetting'] for domain in response['domainAssociation']['subDomains']]
        subdomain_exists = new_subdomain in [domain['prefix'] for domain in existing_subdomains]

        if subdomain_exists:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'message': 'Subdomain already exists'})
            }

        userpoolid = os.environ['DEFAULT_BUYER_USERPOOL_ID']
        if existing_domain_record is None or existing_domain_record.get('default'):
            # Create or update the user pool client
            client_name = seller_email.split('@')[0]
            if not existing_domain_record or not existing_domain_record.get('client_id'):
                userpool_client = create_app_client(userpoolid, client_name, new_subdomain)
                client_id = userpool_client['UserPoolClient']['ClientId']
            else:
                client_id = existing_domain_record['client_id']
                update_app_client(userpoolid, client_id, client_name, new_subdomain)

            # Add new subdomain to the settings
            subdomain_setting = {
                'prefix': new_subdomain,
                'branchName': os.environ["AMPLIFY_BRANCH"]
            }
            existing_subdomains.append(subdomain_setting)
            subdomain_collection.update_one(
                {'seller_email': seller_email},
                {"$set": {'subdomain': new_subdomain, "default": True, 'client_id': client_id}}
            )
        else:
            # Update existing subdomain
            update_mapping = [domain for domain in existing_subdomains if domain['prefix'] != existing_domain_record['subdomain']]
            update_mapping.append({'prefix': new_subdomain, 'branchName': os.environ["AMPLIFY_BRANCH"]})
            subdomain_collection.update_one(
                {'seller_email': seller_email},
                {"$set": {'subdomain': new_subdomain, "default": False}}
            )
            update_app_client(userpoolid, existing_domain_record["client_id"], seller_email.split('@')[0], new_subdomain)

        response = amplify_client.update_domain_association(
            appId=os.environ['AMPLIFY_APP_ID'],
            domainName=os.environ['AMPLIFY_DOMAIN_NAME'],
            enableAutoSubDomain=True,
            subDomainSettings=update_mapping
        )
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({"message": "Subdomain updated"})
        }

    except Exception as err:
        print(err)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': "Internal server error"})
        }