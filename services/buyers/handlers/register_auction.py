"""This module is used for registering the auction"""
import json
import os
import pymongo
from pymongo import MongoClient
from bson import ObjectId

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def register_auction(event, context):
    """
    Register an auction for a buyer.

    This function is responsible for registering an auction for a buyer and
    managing the registration process. It checks if the user has access to
    perform this action, validates the subdomain, and handles different
    registration scenarios.

    Args:
        event (dict): An AWS Lambda event object containing input data.
        context (dict): An AWS Lambda context object.

    Returns:
        dict: A response object with appropriate status code and message.

    Raises:
        Exception: If an internal server error occurs.
    """
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
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        buyer_collection = db[os.environ["BUYER_COLLECTION"]]
        auction_register =db[os.environ["REGISTER_AUCTION_COLLECTION"]]
        auction=db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        counter_collection= db[os.environ["COUNTER_LOT"]]
        data = event['queryStringParameters']
        auction_id= data.get('auction_id')
        auction_id= ObjectId(auction_id)
        if data is None or "auction_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }
        if 'status' in data and data['status'] == 'True':
            result=auction_register.find_one({"auction_id": auction_id,'email_address':email_address })
            status=result['status']
            return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps({'status':status})
            }

        registeration_type=auction.find_one({'_id':ObjectId(auction_id)})
        seller_email= registeration_type['seller_email']
        buyer= buyer_collection.find_one(
            {'email_address':email_address,"seller_email":seller_email}, {'_id': 0})
        first_name=buyer['first_name']
        last_name=buyer['last_name']
        if buyer is None:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please register"})
            }
        status= auction_register.find_one(
            {'email_address':email_address,'auction_id':auction_id}, {'_id': 0})
        if status is not None and status['status'] == 'Pending':
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "status is pending"})
            }
        if registeration_type['registration_type'] == 'Email only':
            register_status="Approved"
            paddle=counter_collection.find_one_and_update({"auction_id": auction_id,
                                                      "seller_email": seller_email,
                                                      "buyer_email":email_address,
                                                      'record_type': 'Paddle'},
                                                     {'$inc': {
                                                         'starting_sequence': 1}},
                                                     return_document=pymongo.ReturnDocument.AFTER,
                                                     upsert=True)
            # send_pinpoint_email(email_address,os.environ['SENDER_EMAIL_ADDRESS'],
            # json.dumps({"paddle":paddle['starting_sequence'] }))
        else:
            register_status="Pending"
            paddle= 0
        data_to_insert= {
						'first_name': first_name,
                        'last_name': last_name,
                        "auction_id":auction_id,
                        "email_address":email_address,
                        "seller_email":seller_email,
                        "status":register_status,
                        "paddle": paddle['starting_sequence']
                        }
        if status is not None and status['status']=='Declined':
            auction_register.update_one({"auction_id": auction_id,'email_address':email_address },{"$set":{"status":'Pending'}})
        auction_register.insert_one(data_to_insert)
        return {
                    "statusCode": 204,
                    'headers': headers,
                    "body": json.dumps({})
                }
    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"message": "Internal server error"})
        }
    