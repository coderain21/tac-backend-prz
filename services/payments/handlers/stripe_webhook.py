"""
Module: stripe_webhook_handler

This module defines a Stripe webhook handler implemented as an AWS Lambda function.
The function is responsible for updating payment data in a MongoDB database based on
events received from the Stripe payment system.
"""
import json
import os
import stripe # type: ignore
from bson import ObjectId
from pymongo import MongoClient
from lib.email_helper import send_mailchimp_payment_email
import mailchimp_transactional as MailchimpTransactional
from mailchimp_transactional.api_client import ApiClientError
from datetime import datetime
import pytz


  # MongoDB configuration
client = MongoClient(
                      os.environ['MONGO_CLIENT']
                    #   maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
user_collection = db[os.environ["MONGODB_COLLECTION_NAME"]]
buyer_collection = db[os.environ["BUYER_COLLECTION"]]
auction = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]




stripe.api_key = os.environ["STRIPE_API_KEY"]
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': False,
}
# This is your Stripe CLI webhook secret for testing your endpoint locally.
endpoint_secret = os.environ['STRIPE_ENDPOINT_SECRET']

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


currencySymbolMapping = {
    "GBP": '£',
    "USD": '$',
    "EUR": '€',
    "HKD": 'HK$',
    "JPY": '¥',
    "CHF": 'Fr',
    "SGD": 'S$',
    "AUD": 'A$',
    "CAD": 'C$',
    "INR": '₹',
}


def update_payment_data(payment_intent_id,update_data):
    """
    Update payment data in the MongoDB collection.

    Parameters:
    - id (str): Payment ID
    - update_data (dict): Dictionary containing fields to update in the payment document

    Returns:
    - pymongo.results.UpdateResult or None: Result of the update operation or None if unsuccessful

    Raises:
    - BaseException: Any unexpected error during the update operation
    """
    try:
        temp_payments_collection = db[os.environ['TEMP_ORDERS_COLLECTION']]
        payments_collection = db[os.environ['ORDERS_COLLECTION']]
        cart_collection = db[os.environ['CART_COLLECTION']]
        # print(update_data)

        # update_result = payments_collection.update_one({"payment_intent": id},{"$set": update_data})

        payment_details = payments_collection.find_one({"payment_intent": payment_intent_id})
        print('payment_details', payment_details)

        if payment_details:
            # Retrieve seller email, buyer email, and auction ID
            seller_email = payment_details.get("seller_email")
            buyer_email = payment_details.get("email_address")
            auction_id = payment_details.get("auction_id")
            order_number = payment_details.get("order_number")

            # # Create the order using the temporary payment data
            # insert_result = create_order(payment_details)

            # Update the payment data
            update_result = payments_collection.update_one({"payment_intent": payment_intent_id}, {"$set": update_data})
            print('update_data', update_data)

            update_condition = { "seller_email": seller_email, "email_address": buyer_email, "auction_id": auction_id, "order_number": order_number}

            insert_result = update_order( update_condition, update_data)
            print('insert_result', insert_result)
            if not insert_result:
                print('order updating failed')
                return None

            # Check if the payment status is "Paid"
            if update_data.get("payment_status") == "Paid":
                print('inside payment paiddd')

                # combined_data = {**payment_details, **update_data}

                # Create the order using the temporary payment data
                # insert_result = update_order( update_condition, update_data)

                # print('here')
                seller = user_collection.find_one({"email_address": seller_email})      #, {'_id': 0})
                # print('seller', seller)
                buyer = buyer_collection.find_one({'email_address': buyer_email, "seller_email": seller_email})
                # print('buyer', buyer)
                auction_data = auction.find_one({'_id': ObjectId(auction_id)})
                # print('auction_data', auction_data)
                get_winning_lot = cart_collection.find({'buyer_id': str(buyer['_id']), 'auction_id': str(auction_id)}, {'_id': 0})
                # Check if the result is a cursor or a single document
                if isinstance(get_winning_lot, list):
                    lots_list = get_winning_lot
                elif hasattr(get_winning_lot, '__iter__'):  # Check if it's a cursor
                    lots_list = list(get_winning_lot)  # Convert cursor to a list of dictionaries
                else:  # It's a single dictionary
                    lots_list = [get_winning_lot]


                for lot in lots_list:
                    # Check if 'lot_image' key exists in the document
                    if 'lot_image' in lot:
                        # Append the CDN URL to the lot_image
                        lot['lot_image'] = os.environ.get('CDN_URL') + lot['lot_image']

                # print('lots_list', lots_list)


                common_time_zone = auction_data.get('time_zone', 'UTC')
                time_zone = TIMEZONE_MAPPING.get(common_time_zone) if common_time_zone in TIMEZONE_MAPPING else time_zone  # Default to UTC if not mapped
                try:
                    tz = pytz.timezone(time_zone)
                except pytz.UnknownTimeZoneError:
                    tz = pytz.utc  # Default to UTC if timezone is unknown
                end_date_time_in_milliseconds = auction_data.get('end_date', datetime.utcnow().timestamp() * 1000)
                end_date_time_utc = datetime.utcfromtimestamp(end_date_time_in_milliseconds / 1000)
                end_date_time_local = end_date_time_utc.replace(tzinfo=pytz.utc).astimezone(tz)
                end_date = end_date_time_local.date()
                end_time = end_date_time_local.time().strftime('%H:%M:%S')
                print('auction ends', end_date, end_time)

                currency = payment_details.get("currency", "")
                # if currency in currencySymbolMapping:
                #     currency = currencySymbolMapping.get(currency, "")
                amount_paid = currency + ' ' + str(payment_details['amount'])
                if not auction_data['logo_image']:
                    logo_img = f"{os.environ.get('CDN_URL')}Logo.png"
                else:
                    logo_img= os.environ["CDN_URL"]+auction_data["logo_image"]

                if seller['first_name']:
                    seller_name = ' '.join(filter(None, [seller['first_name'], seller['last_name']]))
                else:
                    seller_name = 'Seller'

                template_data = {
                    "auction_title":payment_details['auction_title'],
                    "logo_image": logo_img,
                    "auction_end_date": end_date,
                    'account_name': ' '.join(filter(None, [payment_details['billing_address']['first_name'], payment_details['billing_address']['last_name']])),    
                    "address_line1": payment_details['billing_address']['address_line1'],
                    "address_line2": payment_details['billing_address']['address_line2'],
                    "city": payment_details['billing_address']['city'],
                    "state": payment_details['billing_address']['state'],
                    "country": payment_details['billing_address']['country'],
                    "zip_code": payment_details['billing_address']['postal_code'],
                    "email_address": buyer_email,
                    "seller_name": seller_name,      
                    "currency": currency, 
                    "amount_paid": amount_paid,
                    # "cdn_url": os.environ['CDN_URL'],
                    "lots": lots_list,
                }
                # print('template_data', template_data)
                # Checking mailchimp for template existence
                try:
                    mailchimp = MailchimpTransactional.Client(os.environ['MAILCHIMP_SECRET_KEY'])
                    response = mailchimp.templates.info({"name": str(seller['_id']) + '-PAYMENT-RECEIPT'})
                    print('name of the templatee', str(seller['_id']) + '-PAYMENT-RECEIPT')
                    # print(response)
                    template_name = str(seller['_id']) + '-PAYMENT-RECEIPT'
                except ApiClientError as error:
                    template_name = 'default_payment-receipt'
                    print("An exception occurred: {}".format(error.text))

                # print('template_name', template_name)
                send_mailchimp_payment_email(payment_details['email_address'], template_name, template_data, os.environ['MAILCHIMP_ADDRESS'])
                cart_collection.delete_many({"email_address": buyer_email,"seller_email": seller_email,"auction_id": auction_id})

            elif update_data.get('payment_status') == 'Failed' and update_data.get('last_payment_error'):
                # Create the order using the temporary payment data
                # combined_data = {**payment_details, **update_data}

                # insert_result = update_order( update_condtion, update_data)

                print('here in failed status')
                # Delete the cart data
                # cart_collection.delete_many({"email_address": buyer_email,"seller_email": seller_email,"auction_id": auction_id})
                # print('after')
            return update_result

        else:
            # If payment details are not found, return None
            return None


        # client.close()
        # if update_result:
        #     return update_result
        # return None
    except BaseException as err:
        print(f"Unexpected {err=}, {type(err)=}")
        raise


def update_order(update_condition, update_data):
    """
    Add payment data to the MongoDB collection.

    Args:
        insert_data (dict): Dictionary containing payment data to be inserted.

    Returns:
        pymongo.results.InsertOneResult: The result of the MongoDB insert operation.
    """
    try:
        # MongoDB configuration
        client = MongoClient(
                      os.environ['MONGO_CLIENT']
                    # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
        db = client[os.environ['DATABASE']]
        orders_collection = db[os.environ['ORDERS_COLLECTION']]

        update_result = orders_collection.update_one(
            update_condition,
            {"$set": update_data}
        )
        if update_result:
            print("order updated")
            return update_result

        return None

    except BaseException as err:
        print(f"Unexpected {err=}, {type(err)=}")
        raise


def update(event, context):
    """
    AWS Lambda function entry point for handling Stripe webhook events.

    Parameters:
    - event (dict): AWS Lambda event object containing details of the invocation
    - context (object): AWS Lambda context object providing information about the runtime

    Returns:
    - dict: HTTP response containing status code, headers, and body

    Note:
    This function assumes the presence of the required environment variables and expects
    the event to contain a valid Stripe webhook payload.
    """
    try:
        print(event)
        # Lambda function entry point
        try:
            payload = event['body']
            sig_header = event['headers']['Stripe-Signature']

            # Verify the Stripe webhook signature
            event = stripe.Webhook.construct_event(
                payload, sig_header, endpoint_secret
            )
        except ValueError as e:
            print("Invalid payload")
            # Invalid payload
            return {
                "headers": headers,
                'statusCode': 400,
                'body': json.dumps({'message': str(e)})
            }
        except stripe.error.SignatureVerificationError as e:
            print("Invalid signature",e)
            return {
                "headers": headers,
                'statusCode': 400,
                'body': json.dumps({'message': str(e)})
            }
        event_body = payload

        data = json.loads(event_body)
        account_id = data["account"]
        data=data["data"]
        # print('data after payment', data)
        # Handle the event
        if data["object"]["object"] == "payment_intent":
            payment_id = data["object"]["id"]
            update_data= {
                "status": data["object"]["status"],
                "payment_status": "Paid" if data["object"]["status"] == "succeeded" else "Pending",
                "payment_method_types": data["object"]["payment_method_types"]
            }
            if data["object"]["last_payment_error"] is not None:
                update_data["last_payment_error"]= {
                    "message": data["object"]["last_payment_error"]["message"],
                    "decline_code": data["object"]["last_payment_error"]["decline_code"]
                }
                update_data["payment_status"] = 'Failed'

            update_payment_data(payment_id,update_data)
            print('updatedata', update_data)



        return {
            "headers": headers,
            'statusCode': 204,
            'body': json.dumps({})
        }
    except Exception as err:
        print(err)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "There was an error while updating payment data"})
        }