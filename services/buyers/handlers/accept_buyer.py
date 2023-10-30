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

def accept_buyer(event, context):
    try:
        try:
            cognito_data = json.loads(event['requestContext']['authorizer']['data'])
            print(cognito_data)
            email_address = cognito_data['email']
            if "cognito:groups" in cognito_data and not 'buyer' in cognito_data["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
            # email_address='shrinitpoojary1234@gmail.com'
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
        status = data.get('status')
        if data is None or "auction_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }
        print(data)
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
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "buyer doesnt exist"})
            }
        first_name=buyer['first_name']
        current_status= auction_register.find_one(
                        {'email_address':email_address,'auction_id':auction_id}, {'_id': 0})
        if current_status['status'] == 'Approved':
            return {
                    "statusCode": 204,
                    'headers': headers,
                    "body": json.dumps({})
                }
        first_name=buyer['first_name']
        if status == 'Approved':
            paddle=counter_collection.find_one_and_update({"auction_id": auction_id,
                                "seller_email": seller_email,
                                'record_type': 'Paddle'},
                                {'$inc': {
                                    'starting_sequence': 1}},
                                return_document=pymongo.ReturnDocument.AFTER,
                                upsert=True)
            register_status="Approved"
            seller= user_collection.find_one({"email_address":seller_email},{'_id': 0})
            start_date_time= registeration_type['start_date']
            print(type(start_date_time))
            start_date=start_date_time.date()
            start_time=start_date_time.time()
            title = registeration_type['title']
            seller_name= seller['first_name']
            print(start_time,start_date,title,first_name,seller_name)
            if registeration_type["logo_image"] == "":
                logo_img = 'https://indy-auction-dev-assets.s3.eu-west-2.amazonaws.com/public/Logo.png'
            else:
                logo_img= os.environ["CDN_LINK"]+registeration_type["logo_image"]
            template_data = json.dumps({"paddle":paddle['starting_sequence'],
                            "Seller_name": seller_name,"user_first_name": first_name,
                            "Auction_title":title, "auction_start_date":str(start_date) ,
                            "auction_start_time":str(start_time),
                            "color":paddle_text_color,
                            "background_color":paddle_background_color,
                            "img":logo_img,
                            "subject":"Indy.auction-Your Paddle Number Awaits: Registration Successful"})
            print(template_data,111)
            send_pinpoint_email(email_address,os.environ['SENDER_EMAIL_ADDRESS'],
                                template_data,
                                'arn:aws:mobiletargeting:eu-west-2:929441721738:templates/paddle_email/EMAIL')
            auction_register.update_one({"auction_id": auction_id,'email_address':email_address, 'seller_email':seller_email },
                                    {"$set":{"status":register_status,'paddle':paddle['starting_sequence']}})
        elif status == 'Rejected':
            register_status = 'Rejected'
            auction_register.update_one({"auction_id": auction_id,'email_address':email_address, 'seller_email':seller_email },
                                    {"$set":{"status":register_status}})
        else:
            return {
                    "statusCode": 400,
                    'headers': headers,
                    "body": json.dumps({"message": "invalid status"})
                }
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
    