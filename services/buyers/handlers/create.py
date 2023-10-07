"""This module is used to create the userpool for the particular seller when the buyer register"""
import boto3
import os
import json
from lib.common_helper import Encoder

client = boto3.client('cognito-idp',region_name = os.environ["REGION"])

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def create():
    response = client.create_user_pool(
        PoolName='seller3'
    )
    client_response = client.create_user_pool_client(
    UserPoolId= response["UserPool"]["Id"],
    ClientName='seller3-client'
    )
    print(client_response)
    return response

def create_userpool(event, context):
    """

    """
    response = create()
    body={
        "response": response   }
    return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(body,cls=Encoder)
        }