'''this api will retrieve the detail of the buyers'''
import json
import os
from pymongo import MongoClient
# from bson import ObjectId
from lib.common_helper import Encoder

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def view_profile(event, context):
    """
    The `view_profile` function retrieves user profile data from a MongoDB database based on the user's
    email address and returns the data as a JSON response.

    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. It typically includes details such as the HTTP request, headers, and body
    :param context: The `context` parameter is a context object that provides information about the
    runtime environment of the function. It includes details such as the AWS request ID, function name,
    and other metadata
    :return: The function `view_profile` returns a JSON response with a status code, headers, and a
    body. The specific content of the response depends on the execution path of the code.
    """
    try:
        try:
            cognito_data = json.loads(event['requestContext']['authorizer']['data'])
            email_address = cognito_data['email']
            if "cognito:groups" in cognito_data and not 'buyer' in cognito_data["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["BUYER_COLLECTION"]]
        data = event['queryStringParameters']
        if data['update'] == 'True':
            body = json.loads(event['body'])
            update_data={}
            try:
                update_data['country_code']=body['country_code']
                update_data['first_name']= body['first_name']
                # update_data['last_name']= data['last_name']
                update_data['phone_number']= body['phone_number']
            except Exception:
                return {
                    "statusCode": 404,
                    "headers": headers,
                    "body": json.dumps({"message": 'please enter the required fileds'})
                }
            if 'last_name' in body:
                update_data['last_name']= body['last_name']
            result= collection.find_one_and_update({'email_address':email_address},
                                                   {"$set": update_data})
        result= collection.find_one({'email_address':email_address},
                      { "password": 0,
                      "terms_and_condition": 0,
                      "user_type":0,
                      "newsletter_notification":0})
        client.close()
        if result is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "user not found"})
            }
        if 'address_line1' not in result:
            result['address_line1'] = ""
        if 'country_code' not in result:
            result['country_code'] = ""
        if 'address_line2' not in result:
            result['address_line2'] = ""
        if 'phone_number' not in result:
            result['phone_number'] = ""
        if 'state' not in result:
            result['state'] = ""
        if 'country' not in result:
            result['country'] = ""
        return{
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data':result},cls=Encoder)
            }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": e})
            }