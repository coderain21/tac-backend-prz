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
        PoolName='seller1'
    )
    return response
def create_userpool(event, context):
    """

    """
    response = create()
    return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(response,cls=Encoder)
        }