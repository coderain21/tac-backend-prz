'''this api will list the detail of the lot id passed in the parameter'''
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
    try:
        try:
            cognito_data = json.loads(event['requestContext']['authorizer']['data'])
            print(cognito_data['username'])
            email_address = cognito_data['username']
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
        # email_address= 'shrinit.poojary+100@7edge.com'
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["BUYER_COLLECTION"]]
        data = event['queryStringParameters']
        if data['update'] == 'True':
            print(1)
            body = json.loads(event['body'])
            update_data={}
            try:
                update_data['first_name']= body['first_name']
                # update_data['last_name']= data['last_name']
                update_data['phone_no']= body['phone_no']
                print(update_data)
            except Exception:
                return {
                    "statusCode": 404,
                    "headers": headers,
                    "body": json.dumps({"message": 'please enter the required fileds'})
                }
            if body['last_name']:
                update_data['last_name']= body['last_name']
            result= collection.find_one_and_update({'email_address':email_address},
                                                   {"$set": update_data})
            
            return{
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data':result},cls=Encoder)
            }
        result= collection.find_one({'email_address':email_address},
                      { "password": 0,
                      "terms_and_condition": 0,
                      "user_type":0,
                      "newsletter_notification":0,'_id': 0})
        client.close()
        if 'address_line1' not in result:
            result['address_line1'] = ""
        if 'address_line2' not in result:
            result['address_line2'] = ""
        if 'phone_no' not in result:
            result['phone_no'] = ""
        if 'state' not in result:
            result['state'] = ""
        if 'country' not in result:
            result['country'] = ""
        if result is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "user not found"})
            }
        return{
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data':result})

        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": e})
        }