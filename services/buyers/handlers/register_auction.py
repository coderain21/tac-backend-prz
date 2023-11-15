"""This module is used for registering the auction"""
import json
import os
import pymongo
from pymongo import MongoClient
from bson import ObjectId
from lib.helper_python import send_pinpoint_email
from datetime import datetime
#from lib.common_helper import Encoder
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
        buyer_collection = db[os.environ["BUYER_COLLECTION"]]
        auction_register =db[os.environ["REGISTER_AUCTION_COLLECTION"]]
        auction=db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        counter_collection= db[os.environ["COUNTER_LOT"]]
        user_collection= db[os.environ["MONGODB_COLLECTION_NAME"]]
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
        paddle_color= registeration_type['paddle']
        paddle_text_color= paddle_color["text_color"]
        paddle_background_color= paddle_color["background_color"]
        if paddle_text_color== "":
            paddle_text_color="#FFFFFF"
        if paddle_background_color == "":
            paddle_background_color = "#000000"
        seller_email= registeration_type['seller_email']
        buyer= buyer_collection.find_one(
            {'email_address':email_address,"seller_email":seller_email}, {'_id': 0})
        if buyer is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "buyer doesnt exist"})
            }
        first_name=buyer['first_name']
        last_name=buyer['last_name']
        marketing = buyer['newsletter_notification']

        status= auction_register.find_one(
            {'email_address':email_address,'auction_id':auction_id}, {'_id': 0})
        if status is not None and status['status'] == 'Pending':
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "status is pending"})
            }
        if registeration_type['registration_type'] == 'Email only' or registeration_type['registration_type'] == 'Credit (bank) card validation' :
            register_status="Approved"
            seller= user_collection.find_one({"email_address":seller_email},{'_id': 0})
            start_date_time= registeration_type['start_date']
            start_date=start_date_time.date()
            start_time=start_date_time.time()
            title = registeration_type['title']
            seller_name= seller['first_name']
            if registeration_type["logo_image"] == "":
                logo_img = 'https://indy-auction-dev-assets.s3.eu-west-2.amazonaws.com/public/Logo.png'
            else:
                logo_img= os.environ["CDN_LINK"]+registeration_type["logo_image"]
            paddle=counter_collection.find_one_and_update({"auction_id": auction_id,
                            "seller_email": seller_email,
                            'record_type': 'Paddle'},
                            {'$inc': {
                                'starting_sequence': 1}},
                            return_document=pymongo.ReturnDocument.AFTER,
                            upsert=True)
            template_data = json.dumps({"paddle":paddle['starting_sequence'],
                            "Seller_name": seller_name,"user_first_name": first_name,
                            "Auction_title":title, "auction_start_date":str(start_date) ,
                            "auction_start_time":str(start_time),
                            "color":paddle_text_color,
                            "background_color":paddle_background_color,
                            "img":logo_img,"subject":"Indy.auction-Your Paddle Number Awaits: Registration Successful"})
            send_pinpoint_email(email_address,os.environ['SENDER_EMAIL_ADDRESS'],
                                template_data,os.environ['BUYER_AUCTION_REGISTER_TEMPLATE'])
            data_to_insert= {
                        'first_name': first_name,
                        'last_name': last_name,
                        'name': first_name+" "+last_name,
                        "auction_id":auction_id,
                        "email_address":email_address,
                        "seller_email":seller_email,
                        "status":register_status,
                        "paddle": paddle['starting_sequence'],
                        'created_at': datetime.utcnow(),
                        'marketing': marketing
                        }
        else:
            register_status="Pending"
            data_to_insert= {
                            'first_name': first_name,
                            'last_name': last_name,
                            'name': first_name+" "+last_name,
                            "auction_id":auction_id,
                            "email_address":email_address,
                            "seller_email":seller_email,
                            "status":register_status,
                            'created_at': datetime.utcnow(),
                            'marketing': marketing
                   }
        result=auction_register.find_one({"auction_id": auction_id,'email_address':email_address })
        if result is None:
            auction_register.insert_one(data_to_insert)
        else:
            reg_status=result['status']
            if reg_status == 'Rejected':
                register_status='Pending'
                auction_register.update_one({"auction_id": auction_id,'email_address':email_address },{"$set":{"status":register_status}})
        return {
                    "statusCode": 204,
                    'headers': headers,
                    "body": json.dumps({})
                }
    except Exception as e:
        print(e)
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"message": "Internal server error"})
        }