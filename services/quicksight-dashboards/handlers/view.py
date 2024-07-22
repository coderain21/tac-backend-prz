import boto3
import json
import os

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def get_dashboard(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        aws_account_id = '211125706423'  #os.environ.get('AWS_ACCOUNT_ID')
        dashboard_id = '25c91904-12bc-4233-81aa-7b31698622d2' #os.environ.get('DASHBOARD_ID')
        user_name = 'anusha.k@7edge.com' #email_address
        print(user_name,"user_name")
        
        if os.environ.get('STAGE') == 'dev' or os.environ.get('STAGE') == 'pre-prod':
            sts_client = boto3.client('sts')
            assumed_role = sts_client.assume_role(
                RoleArn=os.environ.get('QUICKSIGHT_ASSUME_ROLE_ARN'),
                RoleSessionName='LambdaAccessQuickSightSession'
            )
            print("assumed_role",assumed_role)

            credentials = assumed_role['Credentials']
            session = boto3.Session(
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken'],
                region_name='eu-west-2'
            )
            print(session,"session")
        else:
            print("else")
            session = boto3.Session()

        quicksight_client = session.client('quicksight')
        print("here")
        response = quicksight_client.generate_embed_url_for_registered_user(
            AwsAccountId=aws_account_id,
            ExperienceConfiguration={
                'Dashboard': {
                    'InitialDashboardId': dashboard_id
                }
            },
            SessionLifetimeInMinutes=60,
            UserArn=f"arn:aws:quicksight:eu-west-2:{aws_account_id}:user/default/{user_name}"
        )

        embed_url = response['EmbedUrl']

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'embed_url': embed_url})
        }

    except Exception as e:
        print('Error:', str(e))
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e)})
        }
