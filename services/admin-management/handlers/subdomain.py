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
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
            print('email', email_address)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        seller_email = event['queryStringParameters']['seller_email']
        if seller_email is None:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "seller_email is required"})
            }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        subdomain_collection = db[os.environ['SUBDOMAIN_COLLECTION']]
        data = event['queryStringParameters']
        seller_collection = db[os.environ['SELLERS_TABLE']]
        existing_domain_record= subdomain_collection.find_one({"seller_email":seller_email})
        subdomain=existing_domain_record['subdomain']
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'subdomain':subdomain})
            }
    except Exception as err:
        print(err)
        return {
                    'statusCode': 500,
                    'headers': headers,
                    'body': json.dumps({'message':"Internal server error"})
                    }