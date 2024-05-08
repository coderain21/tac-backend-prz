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
            cognito_data = json.loads(event['requestContext']['authorizer']['data'])
            email_address = cognito_data['email']
            if "cognito:groups" not in cognito_data :
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
        seller_email = data['seller_email']
        update_data={}
        if 'update' in data:
            print('1')
            if data['update'] == 'True':
                print('2')
                body = json.loads(event['body'])
                if 'address_line1' in body:
                    update_data['address_line1']=body['address_line1']
                if 'country' in body:
                    update_data['country']= body['country']
                if 'town/city' in body:
                    update_data['town/city']= body['town/city']
                if 'is_manual' in body:
                    update_data['is_manual']=body['is_manual']
                if 'address_line2' in body:
                    update_data['address_line2'] = body['address_line2']
                if 'postal_code' in body:
                    update_data['postal_code']= body['postal_code']
                result= collection.find_one_and_update({'email_address':email_address, 'seller_email': seller_email},
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
                result= collection.find_one_and_update({'email_address':email_address, 'seller_email': seller_email},
                                                   {"$set": update_data})
        result= collection.find_one({'email_address':email_address, 'seller_email': seller_email},
                      { "password": 0,
                      "terms_and_condition": 0})
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