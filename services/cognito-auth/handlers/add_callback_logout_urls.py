import os
import json
import boto3
import cfnresponse

cognito_idp = boto3.client('cognito-idp')

def get_user_pool_client_config(user_pool_id, client_id):
    response = cognito_idp.describe_user_pool_client(
        UserPoolId=user_pool_id,
        ClientId=client_id
    )
    return response['UserPoolClient']

def add_callback_logout_urls(event, context):
    try:
        user_pool_id = os.environ['BUYER_COGNITO_USERPOOL_ID']
        client_id = os.environ['BUYER_COGNITO_CLIENT_ID']
        resource_properties = event.get('ResourceProperties', {})
        callback_urls = resource_properties.get('CallbackURLs', [])
        logout_urls = resource_properties.get('LogoutURLs', [])
        allowed_oauth_flows = resource_properties.get('AllowedOAuthFlows', [])
        allowed_oauth_scopes = resource_properties.get('AllowedOAuthScopes', [])
        supported_identity_providers = resource_properties.get('SupportedIdentityProviders', [])
        allowed_oauth_flows_user_pool_client = resource_properties.get('AllowedOAuthFlowsUserPoolClient', 'false')
        if isinstance(allowed_oauth_flows_user_pool_client, str):
            allowed_oauth_flows_user_pool_client = allowed_oauth_flows_user_pool_client.lower() == 'true'
        
        print("supported_identity_providers",supported_identity_providers)

        # Get current configuration of the user pool client
        existing_config = get_user_pool_client_config(user_pool_id, client_id)

        # Merge existing and new settings
        callback_urls = list(set(existing_config.get('CallbackURLs', []) + callback_urls))
        logout_urls = list(set(existing_config.get('LogoutURLs', []) + logout_urls))
        allowed_oauth_flows = list(set(existing_config.get('AllowedOAuthFlows', []) + allowed_oauth_flows))
        allowed_oauth_scopes = list(set(existing_config.get('AllowedOAuthScopes', []) + allowed_oauth_scopes))
        # supported_identity_providers = list(set(existing_config.get('SupportedIdentityProviders', []) + supported_identity_providers))

        # Update user pool client with merged settings
        response = cognito_idp.update_user_pool_client(
            UserPoolId=user_pool_id,
            ClientId=client_id,
            CallbackURLs=callback_urls,
            LogoutURLs=logout_urls,
            AllowedOAuthFlowsUserPoolClient=allowed_oauth_flows_user_pool_client,
            AllowedOAuthFlows=allowed_oauth_flows,
            AllowedOAuthScopes=allowed_oauth_scopes,
            SupportedIdentityProviders=supported_identity_providers
        )
        # Send success response back to CloudFormation
        cfnresponse.send(event, context, cfnresponse.SUCCESS, {'message': 'User Pool Client updated successfully'})
    except Exception as e:
        # Send failure response back to CloudFormation
        cfnresponse.send(event, context, cfnresponse.FAILED, {'error': str(e)})