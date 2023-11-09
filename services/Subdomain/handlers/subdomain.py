import json
import os
from pymongo import MongoClient
import boto3


amplify_client = boto3.client('amplify',region_name= 'eu-west-2')

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
        CallbackURLs= [f"https://{subdomain}.{os.environ.get('AMPLIFY_DOMAIN_NAME')}"]
    )
    return response

def subdomain(event, context):
    try:
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
    subdomain_collection = db['dev-subdomain']
    existing_domain_record= subdomain_collection.find_one({"seller_email":seller_email})
    request_body = json.loads(event['body'])
    subdomain = request_body['subdomain']
    plan= request_body['plan']
    if plan == 'pro':
        print(1,os.environ['AMPLIFY_APP_ID'])
        print(2,os.environ['AMPLIFY_DOMAIN_NAME'])
        response = amplify_client.get_domain_association(
                appId=os.environ['AMPLIFY_APP_ID'],
                domainName= os.environ['AMPLIFY_DOMAIN_NAME']
            )
        existing_subdomains = [domain['subDomainSetting'] for domain in response['domainAssociation']['subDomains']]
        check_existance = [domain['prefix'] for domain in existing_subdomains]
        if subdomain in check_existance:
            return 'already exist'
        else:
            if existing_domain_record['default'] is True:
                userpoolid=os.environ['DEFAULT_BUYER_USERPOOL_ID']
                userpool_client=create_app_client(userpoolid, seller_email.split('@')[0],subdomain)
                client_id= userpool_client['UserPoolClient']['ClientId']
                existing_subdomains.append({
                        'prefix': subdomain,
                        'branchName': 'develop'
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
                update_mapping.append({
                        'prefix': subdomain,
                        'branchName': 'develop'
                    })
                print(update_mapping)
                response = amplify_client.update_domain_association(
                    appId=os.environ['AMPLIFY_APP_ID'],
                    domainName=os.environ['AMPLIFY_DOMAIN_NAME'],
                    enableAutoSubDomain=True,
                    subDomainSettings=update_mapping,
                )
        return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps({})
                    }