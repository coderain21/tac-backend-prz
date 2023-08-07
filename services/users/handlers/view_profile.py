import json
import os
from lib.mongodb_python_helper import view_profile
from lib.common_helper import Encoder

def view_customer(event, context):
    try:
        print('entering funct')
        email_address = event['pathParameters']['email'].replace("%40", "@")  # Unescape the email address
        print(email_address)
        customer_details = view_profile(email_address)
        print('******',customer_details)
        if not customer_details:
            body = json.dumps({
                
                'success_status': False,
                'message': 'Customer Not Found'
            })
            return {
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': True,
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Allow-Methods': '*'
                },
                'statusCode': 404,
                'body': body
            }
        
        body = json.dumps({
            'success_status': True,
            'data': customer_details
        },cls=Encoder)
        return {
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': True,
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Methods': '*'
            },
            'statusCode': 200,
            'body': body
        }
    except Exception as error:
        print(error)
        return {
            'success_status': False,
            'message': str(error)
        }
