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

def add_address(event, context):
    try:
        try:
            print(event)
            cognito_data = json.loads(event['requestContext']['authorizer']['data'])
            print(cognito_data)
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
        update_data={}
        print(data)
        if 'update' in data:
            if data['update'] == 'True':
                print(1)
                body = json.loads(event['body'])
                try:
                    update_data['address_line1']=body['address_line1']
                    update_data['country']= body['country']
                    update_data['town/city']= body['town/city']
                    update_data['postal_code']= body['postal_code']
                    update_data['is_manual']=body['is_manual']
                    print(update_data)
                except Exception as e:
                    return {
                        "statusCode": 404,
                        "headers": headers,
                        "body": json.dumps({"message": 'please enter the required fileds'})
                    }
                if body['county']:
                    update_data['county']= body['county']
                if body['address_line2']:
                    update_data['address_line2'] = body['address_line2']
                result= collection.find_one_and_update({'email_address':email_address},
                                                   {"$set": update_data})
        if 'delete' in data:
            if data['delete']== 'True':
                update_data['address_line1']= ""
                update_data['country']= ""
                update_data['town/city']= ""
                update_data['postal_code']= ""
                update_data['county']= ""
                update_data['address_line2'] = ""
                update_data['is_manual'] = ""
                print(update_data)
                result= collection.find_one_and_update({'email_address':email_address},
                                                   {"$set": update_data})
        result= collection.find_one({'email_address':email_address},
                      { "password": 0,
                      "terms_and_condition": 0,
                      "user_type":0,
                      "newsletter_notification":0,'_id': 0})
        client.close()
        if result is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "user not found"})
            }
        return{
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data':result},cls=Encoder)
            }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": e}, cls=Encoder)
            }