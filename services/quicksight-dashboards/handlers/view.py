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


from botocore.exceptions import ClientError

def check_user(client, aws_account_id, user_name):
    print('in check user')
    try:
        response = client.describe_user(
            AwsAccountId=aws_account_id,
            Namespace='default',
            UserName=user_name
        )
        print('after')
        # User exists, return user details
        return response['User']
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            print(f"User {user_name} not found.")
            return None
        else:
            raise

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
        aws_account_id = os.environ['QUICKSIGHT_ACCOUNT_ID']
        print('account id', aws_account_id)
        dashboard_id = os.environ['QUICKSIGHT_DASHBOARD_ID']
        user_name = email_address
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

        user_exists = check_user(quicksight_client, aws_account_id, user_name)

        if not user_exists:
            #if os.environ.get('STAGE') == 'prod':
            print('User does not exist, creating user in quicksight')
            try:
                params = {
                            'AwsAccountId': str(aws_account_id),
                            'Namespace': 'default',
                            'IdentityType': 'QUICKSIGHT',
                            'UserName': user_name,
                            'UserRole': 'READER',
                            'Email': user_name,
                        }
                print('param', params)
                quicksight_client.register_user(**params)  # Create the user in QuickSight
            except Exception as e:
                print('eeeeee')
                print('Error:', str(e))
                return {
                        'statusCode': 500,
                        'headers': headers,
                        'body': json.dumps({'error': str(e)})
                    }


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
