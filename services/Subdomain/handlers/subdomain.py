import json
import os
from pymongo import MongoClient
import boto3

amplify_client = boto3.client('amplify')


headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def subdomain(event, context):
    try:
        # try:
        #     cognito_data = json.loads(event['requestContext']['authorizer']['data'])
        #     email_address = cognito_data['email']
        #     if "cognito:groups" in cognito_data and not 'buyer' in cognito_data["cognito:groups"]:
        #         return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }
        # except:
        #     return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        subdomain_collection = db['dev-subdomain']
        existing_domain_record= subdomain_collection.find_one({"buyer_email":"aishwarya+30@7edge.com"})
        subdomain= 'antique'
        plan= 'pro'
        
        if plan == 'pro':
            response = client.get_domain_association(
                    appId=os.environ['AMPLIFY_APP_ID'],
                    domainName= os.environ['DOMAIN_NAME']
                )
            existing_subdomains = [domain['subDomainSetting'] for domain in response['domainAssociation']['subDomains']]
            check_existance = [domain['prefix'] for domain in existing_subdomains]
            if subdomain in check_existance:
                return 'already exist'
            else:
                result= subdomain_collection.update_one({'seller_email':"aishwarya+30@7edge.com"},{"$set":{'subdomain':subdomain,"default":"false"}})
                if existing_domain_record['default'] == 'true':
                    existing_subdomains.append({
                            'prefix': subdomain,
                            'branchName': 'develop'
                        })
                    response = amplify_client.update_domain_association(
                    appId=os.environ['AMPLIFY_APP_ID'],
                    domainName=os.environ['DOMAIN_NAME'],
                    enableAutoSubDomain=True,
                    subDomainSettings=existing_subdomains,
                )
                else:
                    update_mapping = [domain if domain['prefix'] != existing_domain_record['subdomain'] for domain in existing_subdomains]
                    update_mapping.append({
                            'prefix': subdomain,
                            'branchName': 'develop'
                        })
                    existing_subdomains.append({
                            'prefix': subdomain,
                            'branchName': 'develop'
                        })
                    response = amplify_client.update_domain_association(
                        appId=os.environ['AMPLIFY_APP_ID'],
                        domainName=os.environ['DOMAIN_NAME'],
                        enableAutoSubDomain=True,
                        subDomainSettings=existing_subdomains,
                    )
            return {
                        'statusCode': 200,
                        'headers': headers,
                        'body': json.dumps({'result':result})
                        }