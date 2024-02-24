"""This module is used for registering the auction"""
import json
import os
import pymongo
from pymongo import MongoClient
from bson import ObjectId
from lib.helper_python import send_pinpoint_email
from datetime import datetime
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
            seller_email = event['requestContext']['authorizer']['claims']['email']
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform  this API action"})
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
        auction_reg= data.get('buyer_id')
        auction_reg=ObjectId(auction_reg)
        auction_id= ObjectId(auction_id)
        status = data.get('status')
        if data is None or "auction_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }
        registeration_type=auction.find_one({'_id':ObjectId(auction_id)})
        registeration= auction_register.find_one({'_id':auction_reg})
        email_address = registeration['email_address']
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
            start_date_time_in_milliseconds= registeration_type['start_date']
            # Convert timestamp in milliseconds to datetime object
            start_date_time_in_seconds = start_date_time_in_milliseconds / 1000
            start_date_time = datetime.utcfromtimestamp(start_date_time_in_seconds)
            # Extract date and time
            start_date = start_date_time.date()
            start_time = start_date_time.time().strftime('%H:%M:%S')
            title = registeration_type['title']
            seller_name= seller['first_name']
            if registeration_type["logo_image"] == "":
                logo_img = f"{os.environ.get('CDN_LINK')}Logo.png"
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
            send_pinpoint_email(email_address,os.environ['SES_SENDER_EMAIL_ID'],
                                template_data,
                                os.environ['TEMPLATE_ARN_PADDLE']
                                )
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
    