'''This api will get the dashboard for the user'''
import boto3
import json
import os

from pymongo import MongoClient

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
auction_collection = db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]


# from botocore.exceptions import ClientError

# def check_user(client, aws_account_id, user_name):
#     try:
#         response = client.describe_user(
#             AwsAccountId=aws_account_id,
#             Namespace='default',
#             UserName=user_name
#         )
#         # User exists, return user details
#         return response['User']
#     except ClientError as e:
#         if e.response['Error']['Code'] == 'ResourceNotFoundException':
#             print(f"User {user_name} not found.")
#             return None
#         else:
#             raise

def admin_get_dashboard(event, context):
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


        aws_account_id = os.environ['QUICKSIGHT_ACCOUNT_ID']

        dashboard_id = os.environ['QUICKSIGHT_DASHBOARD_ID']


        data = event['queryStringParameters']
        auction_id = data['auction_id']
        seller_email = data['seller_email']

        user_name = seller_email

        admin_user_name = email_address

        auctions_data = auction_collection.find_one({"auction_id":auction_id, "seller_email":seller_email})

        a_id = auctions_data['_id']

        if os.environ.get('STAGE') == 'dev' or os.environ.get('STAGE') == 'pre-production':
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
                    region_name=os.environ['REGION']
                )
            print(session,"session")
        else:
            print("else")
            session = boto3.Session()

        quicksight_client = session.client('quicksight')

        # user_exists = check_user(quicksight_client, aws_account_id, user_name)

        # if not user_exists:
        #     #if os.environ.get('STAGE') == 'prod':
        #     print('User does not exist, creating user in quicksight')
        #     try:
        #         params = {
        #             'AwsAccountId': str(aws_account_id),
        #             'Namespace': 'default',
        #             'IdentityType': 'QUICKSIGHT',
        #             'UserName': user_name,
        #             'UserRole': 'READER',
        #             'Email': 'placeholder@example.com',   #temporary dummy email
        #         }
        #         print('param', params)
        #         response = quicksight_client.register_user(**params)  # Create the user in QuickSight
        #         print('registered user', response)

        #         update_params = {
        #             'AwsAccountId': str(aws_account_id),
        #             'UserName': user_name,
        #             'Namespace': 'default',
        #             'Email': user_name,
        #             'Role': 'READER'
        #         }
        #         update_response = quicksight_client.update_user(**update_params)  # Update the user in QuickSight
        #         print('updated user', update_response)


        #     except Exception as e:
        #         print('eeeeee')
        #         print('Error:', str(e))
        #         return {
        #                 'statusCode': 500,
        #                 'headers': headers,
        #                 'body': json.dumps({'error': str(e)})
        #             }


        response = quicksight_client.generate_embed_url_for_registered_user(
            AwsAccountId=aws_account_id,
            ExperienceConfiguration={
                'Dashboard': {
                    'InitialDashboardId': dashboard_id
                }
            },
            SessionLifetimeInMinutes=60,
            UserArn=f"arn:aws:quicksight:eu-west-2:{aws_account_id}:user/default/{admin_user_name}"
        )

        embed_url = response['EmbedUrl']

        final_embed_url = f'{embed_url}#p.email={seller_email}&p.id={auction_id}&p.auctionid={a_id}'

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'embed_url': final_embed_url})
        }

    except Exception as e:
        print('Error:', str(e))
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e)})
        }
