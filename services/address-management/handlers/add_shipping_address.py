import json
from pymongo import MongoClient
import os
from lib.common_helper import Encoder
from bson import ObjectId

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}
def credit_card(event, context):
    # Parse the request body to get the token and buyer_
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
        # Create a SetupIntent to confirm the PaymentMethod
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db['dev-address-management']
        request_body = json.loads(event['body'])
        data = event['queryStringParameters']
        if 'add' in data:
            add =data['add']
        if 'view' in data:
            view =data['view']
        if 'update' in data:
            update =data['update']
        if 'address_id' in data:
            address_id=data['address_id']
        try:
            address_line1=request_body['address_line1']
            address_line2= request_body['address_line2']
            city=request_body['city']
            state=request_body['state']
            postal_code=request_body['postal_code']
            country=request_body['country']
            type= request_body['type']
            same= request_body['same']
        except:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "please provide the required fields"})
            }
        request_body= request_body.('same')
        address = collection.find_one({'email_address':email_address})
        if address is None:
            default = True
        else:
            default= False
        if add == 'True':
            if type =='shipping' or same == 'True':
                result= collection.insert_one({'email_address':email_address,'shipping_address':request_body,'default': default})
            if type == 'billing' or same == 'True':
                result= collection.insert_one({'email_address':email_address,'billing_address':request_body, 'default':default})
            return {
                        "statusCode": 204,
                        'headers': headers,
                        "body": json.dumps({'message': "sucessfull"})
                    }
        if view == 'True':
            result = collection.find_one({'email_address':email_address})
            return {
                        "statusCode": 200,
                        'headers': headers,
                        "body": json.dumps({"result":result})
                    }
        if update == 'True':
            result = collection.update_one({'email_address':email_address,'default':True},{'$set':{'default':False}})
            result = collection.update_one({'_id':ObjectId(address_id)},{'$set':{'default':True}})
            return {
                        "statusCode": 204,
                        'headers': headers,
                        "body": json.dumps({"message":"Successful"})
                    }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": e}, cls=Encoder)
            }

