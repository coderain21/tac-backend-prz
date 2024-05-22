"""
Module: address_management_api

AWS Lambda function `add_shipping_address` adds shipping/billing addresses to user profiles.
Handles HTTP requests, validates permissions via Amazon Cognito, and stores data in MongoDB.

Dependencies:
- json: Parsing JSON data.
- pymongo: MongoDB driver.
- os: Accessing environment variables.
- lib.common_helper.Encoder: Custom JSON encoder.

Response Structure:
- JSON response with status code, headers, and message.
"""

import boto3
import os

cognito_idp = boto3.client('cognito-idp')

def add_callback_logout_urls(event, context):
    user_pool_id = os.environ['BUYER_COGNITO_USERPOOL_ID']
    client_id = os.environ['BUYER_COGNITO_CLIENT_ID']
    callback_urls = event.get('callback_urls', [])
    logout_urls = event.get('logout_urls', [])
    allowed_oauth_flows_user_pool_client = event.get('allowed_oauth_flows_user_pool_client', False)
    allowed_oauth_flows = event.get('allowed_oauth_flows', [])
    allowed_oauth_scopes = event.get('allowed_oauth_scopes', [])

    response = cognito_idp.update_user_pool_client(
        UserPoolId=user_pool_id,
        ClientId=client_id,
        CallbackURLs=callback_urls,
        LogoutURLs=logout_urls,
        AllowedOAuthFlowsUserPoolClient=allowed_oauth_flows_user_pool_client,
        AllowedOAuthFlows=allowed_oauth_flows,
        AllowedOAuthScopes=allowed_oauth_scopes
    )

    return {
        'statusCode': 200,
        'body': 'User Pool Client updated successfully'
    }