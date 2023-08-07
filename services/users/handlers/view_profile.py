import json
import os

from ..lib import mongodb_python_helper


def view_customer(event):
    try:
        email_address = event['pathParameters']['email'].replace("%40", "@")  # Unescape the email address
        customer_details = mongodb_python_helper.view_profile(email_address)    
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
        })
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
