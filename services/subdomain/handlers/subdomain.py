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
    """
    The `subdomain` function is a Python function that handles requests related to subdomains, including
    creating and updating subdomains for a seller.
    :param event: The `event` parameter is the input event data that triggers the function. It contains
    information about the request that was made to the function, such as the HTTP method, headers, and
    body
    :param context: The `context` parameter is typically used to provide information about the runtime
    environment of the function. It can include details such as the AWS request ID, the function name,
    and the function version. In this code snippet, the `context` parameter is not used, so it can be
    removed from the
    :return: The code is returning a JSON response with a status code, headers, and a body. The specific
    response depends on the execution path of the code. Some possible responses include:
    """
    try:
        try:
            print(event)
            seller_email = event['requestContext']['authorizer']['claims']['email']
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
            print('email', seller_email)
        except:
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
        existing_domain_record= subdomain_collection.find_one({"seller_email":seller_email})
        if data is not None:
            if 'view' in data:
                if data['view'] == 'True':
                    subdomain=existing_domain_record['subdomain']
                    return {
                        'statusCode': 200,
                        'headers': headers,
                        'body': json.dumps({'subdomain':subdomain})
                        }
        request_body = json.loads(event['body'])
        subdomain = request_body['subdomain']
        plan= request_body['plan']
        seller= seller_collection.find_one({'email_address':seller_email})
        plan = seller['plan_type']
        if plan == 'Pro':
            response = amplify_client.get_domain_association(
                    appId=os.environ['AMPLIFY_APP_ID'],
                    domainName= os.environ['AMPLIFY_DOMAIN_NAME']
                )
            existing_subdomains = [domain['subDomainSetting'] for domain in response['domainAssociation']['subDomains']]
            check_existance = [domain['prefix'] for domain in existing_subdomains]
            if subdomain in check_existance:
                return {
                        'statusCode': 404,
                        'headers': headers,
                        'body': json.dumps({'message':'already exists'})
                        }
            else:
                if existing_domain_record['default'] is True:
                    userpoolid=os.environ['DEFAULT_BUYER_USERPOOL_ID']
                    userpool_client=create_app_client(userpoolid, seller_email.split('@')[0],subdomain)
                    client_id= userpool_client['UserPoolClient']['ClientId']
                    existing_subdomains.append({
                            'prefix': subdomain,
                            'branchName': os.environ["AMPLIFY_BRANCH"]
                        })
                    identity_pool_client = boto3.client('cognito-identity')
                    identity_response = identity_pool_client.update_identity_pool(
                        IdentityPoolId=os.environ.get('DEFAULT_INDENTITY_POOL_ID'),
                        IdentityPoolName=os.environ.get('DEFAULT_IDENTITY_POOL_NAME'),
                        AllowUnauthenticatedIdentities=True,
                        AllowClassicFlow=True,
                        CognitoIdentityProviders=[
                            {
                                'ProviderName': f'cognito-idp.eu-west-2.amazonaws.com/{userpoolid}',
                                'ClientId': client_id,
                            },
                        ]
                    )
                    result= subdomain_collection.update_one({'seller_email':seller_email},{"$set":{'subdomain':subdomain,"default":False,'client_id':client_id}})
                    response = amplify_client.update_domain_association(
                    appId=os.environ['AMPLIFY_APP_ID'],
                    domainName=os.environ['AMPLIFY_DOMAIN_NAME'],
                    enableAutoSubDomain=True,
                    subDomainSettings=existing_subdomains,
                    )

                else:
                    update_mapping = [domain for domain in existing_subdomains if domain['prefix'] != existing_domain_record['subdomain']]
                    userpoolid=os.environ['DEFAULT_BUYER_USERPOOL_ID']
                    update_mapping.append({
                            'prefix': subdomain,
                            'branchName': os.environ["AMPLIFY_BRANCH"]
                        })
                    result= subdomain_collection.update_one({'seller_email':seller_email},{"$set":{'subdomain':subdomain,"default":False}})
                    response_update_client = update_app_client(userpoolid,existing_domain_record["client_id"],seller_email.split('@')[0],request_body['subdomain'])
                    response = amplify_client.update_domain_association(
                        appId=os.environ['AMPLIFY_APP_ID'],
                        domainName=os.environ['AMPLIFY_DOMAIN_NAME'],
                        enableAutoSubDomain=True,
                        subDomainSettings=update_mapping,
                    )
            return {
                        'statusCode': 200,
                        'headers': headers,
                        'body': json.dumps({"message":"Subdomain updated"})
                        }
        else:
            return {
                        'statusCode': 404,
                        'headers': headers,
                        'body': json.dumps({'message':"please upgrade your plan"})
                        }
    except Exception as err:
        print(err)
        return {
                    'statusCode': 500,
                    'headers': headers,
                    'body': json.dumps({'message':"Internal server error"})
                    }