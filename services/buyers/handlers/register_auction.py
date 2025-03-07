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

#from lib.common_helper import Encoder
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
auction_register =db[os.environ["REGISTER_AUCTION_COLLECTION"]]
auction=db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]
counter_collection= db[os.environ["COUNTER_LOT"]]
user_collection= db[os.environ["MONGODB_COLLECTION_NAME"]]
subdomain_collection = db[os.environ['SUB_DOMAIN_TABLE']]
template_collection = db[os.environ['MAILCHIMP_COLLECTION']]
subdomain_collection = db[os.environ['SUB_DOMAIN_TABLE']]
template_collection = db[os.environ['MAILCHIMP_COLLECTION']]



TIMEZONE_MAPPING = {
        'UTC - Coordinated Universal Time': 'Etc/UTC',
        'GMT - Greenwich Mean Time': 'Etc/GMT',
        'BST - British Summer Time': 'Europe/London',
        'CET - Central European Time': 'Europe/Paris',
        'IST - India Standard Time': 'Asia/Kolkata',  # Updated key to match received timezone information
        'CST - China Standard Time': 'Asia/Shanghai',
        'JST - Japan Standard Time': 'Asia/Tokyo',
        'AEST - Australian Eastern Standard Time': 'Australia/Sydney',
        'NZST - New Zealand Standard Time': 'Pacific/Auckland',
        'PST - Pacific Standard Time(US)': 'America/Los_Angeles',
        'MST - Mountain Standard Time (US)': 'America/Denver',
        'CST - Central Standard Time (US)': 'America/Chicago',
        'EST - Eastern Standard Time (US)': 'America/New_York',
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
        # try:
        #     cognito_data = json.loads(
        #         event['requestContext']['authorizer']['data'])
        #     email_address = cognito_data['email']
        #     if "cognito:groups" not in cognito_data :
        #         return {
        #             "statusCode": 403,
        #             "headers": headers,
        #             "body": json.dumps({"message": "You do not have access to perform this API action"})
        #         }
        # except:
        #     return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
            print('email', email_address)
        except Exception as e:
            print('error', e)
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        data = event['queryStringParameters']
        auction_id = data.get('auction_id')
        auction_id = ObjectId(auction_id)
        if data is None or "auction_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }
        if 'status' in data and data['status'] == 'True':
            result = auction_register.find_one({"auction_id": auction_id, 'email_address': email_address})
            if result is None:
                return {
                    "statusCode": 404,
                    "headers": headers,
                    "body": json.dumps({'message': 'not found'})
                }
            status = result['status']
            return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps({'status': status})
            }
        registration_type = auction.find_one({'_id': ObjectId(auction_id)})
        if registration_type is None:
            # Handle the case where the auction is not found
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Auction not found"})
            }

        common_time_zone = registration_type.get('time_zone', 'UTC')
        time_zone = TIMEZONE_MAPPING.get(common_time_zone, 'UTC')  # Default to UTC if not mapped
        try:
            tz = pytz.timezone(time_zone)
        except pytz.UnknownTimeZoneError:
            print("Unknown timezone encountered:", time_zone)
            tz = pytz.utc  # Default to UTC if timezone is unknown

        # Handling date and time conversion
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

        paddle_color = registration_type['paddle']
        paddle_text_color = paddle_color["text_color"]
        paddle_background_color = paddle_color["background_color"]
        if paddle_text_color == "":
            paddle_text_color = "#FFFFFF"
        if paddle_background_color == "":
            paddle_background_color = "#000000"
        seller_email = registration_type['seller_email']
        print('seller email', seller_email, email_address)
        buyer = buyer_collection.find_one(
            {'email_address': email_address, "seller_email": seller_email}, {'_id': 0})
        print('buyer', buyer)
        if buyer is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "buyer doesnt exist"})
            }
        first_name = buyer['first_name']
        last_name = buyer['last_name']
        marketing = buyer['newsletter_notification']

        status = auction_register.find_one(
            {'email_address': email_address, 'auction_id': auction_id}, {'_id': 0})
        if status is not None and status['status'] == 'Pending':
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "status is pending"})
            }

        seller = user_collection.find_one({"email_address": seller_email}) #, {'_id': 0})
        print('seller 1234', seller)

        title = registration_type['title']
        seller_name= seller['first_name']
        if registration_type["logo_image"] == "":

            logo_img = f"{os.environ.get('CDN_LINK')}Logo.png"
        else:
            logo_img= os.environ["CDN_LINK"]+registration_type["logo_image"]
        # paddle=counter_collection.find_one_and_update({"auction_id": auction_id,
        #                 "seller_email": seller_email,
        #                 'record_type': 'Paddle'},
        #                 {'$inc': {
        #                     'starting_sequence': 1}},
        #                 return_document=pymongo.ReturnDocument.AFTER,
        #                 upsert=True)
        subdomain = subdomain_collection.find_one({"seller_email": seller_email})
        domain_url = f"https://{subdomain['subdomain']}.{os.environ['AMPLIFY_DOMAIN_NAME']}/auctions/{auction_id}"


        if registration_type['template_name'] == 'Single Lot':
            lot_details = lot_collection.find_one({'auction_id': registration_type['auction_id'], 'seller_email': registration_type['seller_email']})
            lot_image = next((f"{os.environ.get('CDN_LINK')}{image['url']}" for image in lot_details['images'] if image.get('featured')), None)
            print('lot image ', lot_image)  
            auction_image = f"{lot_image}"
            print('auction image', auction_image)
        else:
            auction_image = f"{os.environ.get('CDN_LINK')}{registration_type['auction_image']}"


        print('auction image after', auction_image)
        if registration_type['registration_type'] == 'Email only' or registration_type['registration_type'] == 'Credit (bank) card validation':
            #creating the counter inside this condition because it was causing issue in manual approval bidder feature
            paddle=counter_collection.find_one_and_update({"auction_id": auction_id,
                        "seller_email": seller_email,
                        'record_type': 'Paddle'},
                        {'$inc': {
                            'starting_sequence': 1}},
                        return_document=pymongo.ReturnDocument.AFTER,
                        upsert=True)
        subdomain = subdomain_collection.find_one({"seller_email": seller_email})
        domain_url = f"https://{subdomain['subdomain']}.{os.environ['AMPLIFY_DOMAIN_NAME']}/auctions/{auction_id}"

        # for single lot auction, the template image should be same as the lot lead image
        if registration_type['template_name'] == 'Single Lot':
            lot_details = lot_collection.find_one({'auction_id': registration_type['auction_id'], 'seller_email': registration_type['seller_email']})
            lot_image = next((f"{os.environ.get('CDN_LINK')}{image['url']}" for image in lot_details['images'] if image.get('featured')), None)
            auction_image = f"{lot_image}"
        else:
            auction_image = f"{os.environ.get('CDN_LINK')}{registration_type['auction_image']}"


        if registration_type['registration_type'] == 'Email only' or registration_type['registration_type'] == 'Credit (bank) card validation':
            register_status = "Approved"
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
            print('template data', template_data)
            # send_pinpoint_email(email_address,os.environ['SES_SENDER_EMAIL_ID'],
            #                     template_data,os.environ['BUYER_AUCTION_REGISTER_TEMPLATE'])

            # template = template_collection.find_one({"seller_email": seller_email, 'type': 'paddle'})
            try:
                mailchimp = MailchimpTransactional.Client(os.environ['MAILCHIMP_SECRET_KEY'])
                response = mailchimp.templates.info({"name": str(seller['_id']) + '-PADDLE-GENERATION'})
                print('name of the templatee', str(seller['_id']) + '-PADDLE-GENERATION')
                print(response)
                template_name = str(seller['_id']) + '-PADDLE-GENERATION'
            except ApiClientError as error:
                template_name = 'buyer_default_paddle_template'
                print("An exception occurred: {}".format(error.text))

            if os.environ['STAGE'] in ['pre-production', 'beta'] and email_address.startswith('indyauctiontestops+k6'):
                print('Skipping sending email', email_address)
            else:
                print('sending mailchimp email', email_address, template_name, template_data, os.environ['MAILCHIMP_ADDRESS'])
                send_mailchimp_email(email_address, template_name, template_data, os.environ['MAILCHIMP_ADDRESS'])

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
            template_data = {
                            "Seller_name": seller_name,
                            "Auction_title":title, 
                            "auction_start_date":str(start_date) ,
                            "auction_start_time":str(start_time),
                            "auction_end_date":str(end_date),
                            "auction_end_time":str(end_time),
                            "auction_image": auction_image,
                            "logo":logo_img,
                            "subject":"Indy.auction-Your Registration awaits: Pending Approval",
                            "Seller_email": seller_email,
                            "domainURL": domain_url
            }

            try:
                mailchimp = MailchimpTransactional.Client(os.environ['MAILCHIMP_SECRET_KEY'])
                response = mailchimp.templates.info({"name": str(seller['_id']) + '-BUYER-PENDING-APPROVAL-EMAIL'})
                print('name of the templatee', str(seller['_id']) + '-BUYER-PENDING-APPROVAL-EMAIL')
                print(response)
                template_name = str(seller['_id']) + '-BUYER-PENDING-APPROVAL-EMAIL'
            except ApiClientError as error:
                template_name = 'default_buyer_pending_approval_email'
                print("An exception occurred: {}".format(error.text))

            print('template_name', template_name)
            if os.environ['STAGE'] in ['pre-production', 'beta'] and email_address.startswith('indyauctiontestops+k6'):
                print('Skipping sending email', email_address)
            else:
                send_mailchimp_email(email_address, template_name, template_data, os.environ['MAILCHIMP_ADDRESS'])

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
        print('result', result)
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