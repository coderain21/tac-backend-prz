""" This module contains the view_customer function, which is used to view customer details based on their email address.
 """
import json
# allow-wildcard-with-all=yes
from lib.mongodb_python_helper import view_profile
from lib.common_helper import Encoder
from urllib.parse import unquote

headers = {
    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': True,
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Allow-Methods': '*'
}
def view_customer(event, context):
    """
    The `view_customer` function retrieves customer details based on their email address and returns a
    JSON response with the customer details if found, or an error message if not found.

    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. In this case, it likely contains information about the HTTP request that was
    made to the function
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other contextual information. In this code, the `context` parameter is not used, but it is included
    in the function signature for compatibility
    :return: The function `view_customer` returns a dictionary with the following keys:
    - 'headers': A dictionary containing the headers for the response.
    - 'statusCode': An integer representing the status code of the response.
    - 'body': A string containing the body of the response.
    """
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
            path_email_address = unquote(event['pathParameters']['email'])
            if email_address != path_email_address:
                return {
                    "headers": headers,
                    "statusCode": 403,
                    "body": json.dumps({"message": "You do not have access to perform this API action"})
                }
        except:
            return {
                "headers": headers,
                "statusCode": 403,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        print('entering funct')
        # email_address = event['pathParameters']['email'].replace(
        #     "%40", "@")  # Unescape the email address
        print(email_address)
        customer_details = view_profile(email_address)
        if not customer_details:
            body = json.dumps({
                'success_status': False,
                'message': 'Customer Not Found'
            })
            return {
                'headers': headers,
                'statusCode': 404,
                'body': body
            }
        body = json.dumps({
            'success_status': True,
            'data': customer_details
        }, cls=Encoder)
        return {
            'headers': headers,
            'statusCode': 200,
            'body': body
        }
    except Exception as error:
        print(error)
        return {
            'success_status': False,
            'message': str(error)
        }
