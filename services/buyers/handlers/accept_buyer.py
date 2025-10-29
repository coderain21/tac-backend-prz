"""This module is used for registering the auction"""
import json
import os
import pymongo
from pymongo import MongoClient
from bson import ObjectId
# from lib.helper_python import send_pinpoint_email
from lib.email_helper import send_mailchimp_email
from datetime import datetime
import pytz
import mailchimp_transactional as MailchimpTransactional
from mailchimp_transactional.api_client import ApiClientError

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
buyer_collection = db[os.environ["BUYER_COLLECTION"]]
auction_register = db[os.environ["REGISTER_AUCTION_COLLECTION"]]
auction = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
counter_collection = db[os.environ["COUNTER_LOT"]]
lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]
user_collection = db[os.environ["MONGODB_COLLECTION_NAME"]]
subdomain_collection = db[os.environ['SUB_DOMAIN_TABLE']]

TIMEZONE_MAPPING = {
    'UTC - Coordinated Universal Time': 'Etc/UTC',
    'GMT - Greenwich Mean Time': 'Etc/GMT',
    'BST - British Summer Time': 'Europe/London',
    'CET - Central European Time': 'Europe/Paris',
    'IST - India Standard Time': 'Asia/Kolkata',
    'CST - China Standard Time': 'Asia/Shanghai',
    'JST - Japan Standard Time': 'Asia/Tokyo',
    'AEST - Australian Eastern Standard Time': 'Australia/Sydney',
    'NZST - New Zealand Standard Time': 'Pacific/Auckland',
    'PST - Pacific Standard Time(US)': 'America/Los_Angeles',
    'MST - Mountain Standard Time (US)': 'America/Denver',
    'MDT - Mountain Daylight Time (US)': 'America/Denver',
    'CST - Central Standard Time (US)': 'America/Chicago',
    'EST - Eastern Standard Time (US)': 'America/New_York',
}

def accept_buyer(event, context):
    try:
        try:
            seller_email = event['requestContext']['authorizer']['claims']['email']
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
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

        data = event['queryStringParameters']
        auction_id = data.get('auction_id')
        auction_reg = data.get('buyer_id')
        auction_reg = ObjectId(auction_reg)
        auction_id = ObjectId(auction_id)
        status = data.get('status')
        if data is None or "auction_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }

        registration_type = auction.find_one({'_id': ObjectId(auction_id), 'seller_email': seller_email})
        registration = auction_register.find_one({'_id': auction_reg})
        email_address = registration['email_address']
        paddle_color = registration_type['paddle']
        paddle_text_color = paddle_color["text_color"]
        paddle_background_color = paddle_color["background_color"]
        if paddle_text_color == "":
            paddle_text_color = "#FFFFFF"
        if paddle_background_color == "":
            paddle_background_color = "#000000"
        seller_email = registration_type['seller_email']
        buyer = buyer_collection.find_one(
            {'email_address': email_address, "seller_email": seller_email}, {'_id': 0})
        if buyer is None:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "buyer doesn't exist"})
            }
        first_name = buyer['first_name']

        common_time_zone = registration_type.get('time_zone', 'UTC')

        # Use common_time_zone for lookup
        time_zone = TIMEZONE_MAPPING.get(common_time_zone, 'UTC')

        try:
            tz = pytz.timezone(time_zone)
        except pytz.UnknownTimeZoneError:
            tz = pytz.utc  # Default to UTC if timezone is unknown


        start_date_time_in_milliseconds = registration_type.get('start_date', datetime.utcnow().timestamp() * 1000)
        start_date_time_utc = datetime.utcfromtimestamp(start_date_time_in_milliseconds / 1000)
        start_date_time_local = start_date_time_utc.replace(tzinfo=pytz.utc).astimezone(tz)
        start_date = start_date_time_local.date()
        start_time = start_date_time_local.time().strftime('%H:%M:%S')

        print('Start date:', start_date, 'Start time:', start_time)



        end_date_time_in_milliseconds = registration_type.get('end_date', datetime.utcnow().timestamp() * 1000)
        end_date_time_utc = datetime.utcfromtimestamp(end_date_time_in_milliseconds / 1000)
        end_date_time_local = end_date_time_utc.replace(tzinfo=pytz.utc).astimezone(tz)
        end_date = end_date_time_local.date()
        end_time = end_date_time_local.time().strftime('%H:%M:%S')

        print('Start date:', start_date, 'Start time:', start_time)

        if status == 'Approved':
            #so the counter is getting created here itself for the first time when they approve the bidder.
            paddle = counter_collection.find_one_and_update({"auction_id": auction_id,
                                "seller_email": seller_email,
                                'record_type': 'Paddle'},
                                {'$inc': {'starting_sequence': 1}},
                                return_document=pymongo.ReturnDocument.AFTER,
                                upsert=True)
            register_status = "Approved"
            seller = user_collection.find_one({"email_address": seller_email}) #, {'_id': 0})
            title = registration_type['title']
            seller_name = seller['first_name']
            if registration_type["logo_image"] == "":
                logo_img = f"{os.environ.get('CDN_LINK')}Logo.png"
            else:
                logo_img = os.environ["CDN_LINK"] + registration_type["logo_image"]


            # for single lot auction, the template image should be same as the lot lead image
            if registration_type['template_name'] == 'Single Lot':
                lot_details = lot_collection.find_one({'auction_id': registration_type['auction_id'], 'seller_email': registration_type['seller_email']})
                lot_image = next((f"{os.environ.get('CDN_LINK')}{image['url']}" for image in lot_details['images'] if image.get('featured')), None)
                auction_image = f"{lot_image}"
            else:
                auction_image = f"{os.environ.get('CDN_LINK')}{registration_type['auction_image']}"





            subdomain = subdomain_collection.find_one({"seller_email": seller_email})
            domain_url = f"https://{subdomain['subdomain']}.{os.environ['AMPLIFY_DOMAIN_NAME']}/auctions/{auction_id}"
            template_data = {"paddle":paddle['starting_sequence'],
                            "Seller_name": seller_name,"user_first_name": first_name,
                            "Auction_title":title, "auction_start_date":str(start_date) ,
                            "auction_start_time":str(start_time),
                            "auction_end_date":str(end_date), "auction_end_time":str(end_time),
                            "auction_image": auction_image,
                            "color":paddle_text_color,
                            "background_color":paddle_background_color,
                            "logo":logo_img,"subject":"Indy.auction-Your Paddle Number Awaits: Registration Successful",
                            "Seller_email": seller_email,
                            "domainURL": domain_url
            }

            # Checking mailchimp for template existence
            try:
                mailchimp = MailchimpTransactional.Client(os.environ['MAILCHIMP_SECRET_KEY'])
                print('mailchimp client initialized')

                response = mailchimp.templates.info({"name": f"{seller['_id']}-PADDLE-GENERATION"})
                print('response', response)

                if response.get('name') == f"{seller['_id']}-PADDLE-GENERATION":
                    template_name = f"{seller['_id']}-PADDLE-GENERATION"
                else:
                    template_name = 'buyer_default_paddle_template'


            except ApiClientError as error:
                # This will catch both "Unknown_Template" and any API-related failure
                print(f"Mailchimp API Error: {error.text}")
                template_name = 'buyer_default_paddle_template'


            except Exception as e:
                # This ensures we catch network or unexpected errors too
                print(f"Unexpected Mailchimp error: {e}")
                template_name = 'buyer_default_paddle_template'

            print('template_name', template_name)
            send_mailchimp_email(email_address, template_name, template_data, os.environ['MAILCHIMP_ADDRESS'])



            auction_register.update_one({"auction_id": auction_id, 'email_address': email_address, 'seller_email': seller_email},
                                    {"$set": {"status": register_status, 'paddle': paddle['starting_sequence']}})
        elif status == 'Rejected':
            register_status = 'Rejected'
            auction_register.update_one({"auction_id": auction_id, 'email_address': email_address, 'seller_email': seller_email},
                                    {"$set": {"status": register_status}})
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
