"""
Module: paypal_webhook_handler

This module defines a PayPal webhook handler implemented as an AWS Lambda function.
The function is responsible for updating payment data in a MongoDB database based on
events received from the PayPal payment system.
"""
import json
import os
from bson import ObjectId
from pymongo import MongoClient
from lib.email_helper import send_mailchimp_payment_email
from lib.paypal_helper import get_paypal_access_token
import mailchimp_transactional as MailchimpTransactional
from mailchimp_transactional.api_client import ApiClientError
from datetime import datetime
import pytz
import requests

# MongoDB configuration
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
user_collection = db[os.environ["MONGODB_COLLECTION_NAME"]]
buyer_collection = db[os.environ["BUYER_COLLECTION"]]
auction = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
PAYPAL_API_URL = os.environ['PAYPAL_URL']

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': False,
}



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
    'CST - Central Standard Time (US)': 'America/Chicago',
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




def update_order(payment_intent, update_data):
    """
    Update order data in the MongoDB collection.

    Parameters:
    - order_id (str): PayPal Order ID
    - update_data (dict): Dictionary containing fields to update in the order document

    Returns:
    - pymongo.results.UpdateResult or None: Result of the update operation or None if unsuccessful
    """
    try:
        temp_payments_collection = db[os.environ['TEMP_ORDERS_COLLECTION']]
        payments_collection = db[os.environ['ORDERS_COLLECTION']]
        cart_collection = db[os.environ['CART_COLLECTION']]

        temp_payment_details = temp_payments_collection.find_one({"payment_intent": payment_intent})
        print('payment_details', temp_payment_details)

        # If not in temp, check main payments collection
        if not temp_payment_details:
            existing_order = payments_collection.find_one({"payment_intent": payment_intent})
            print('existing order', existing_order)
            if not existing_order:
                print(f"No payment details found for payment_intent: {payment_intent}")
                return None
            # Retrieve key information
            seller_email = existing_order.get("seller_email")
            buyer_email = existing_order.get("email_address")
            auction_id = existing_order['purchases'][0]['auction_id']

            print('data', seller_email, buyer_email, auction_id)

            # If this is a COMPLETED event and we have an existing order
            if update_data.get("payment_status") == "Paid":
                print('Payment captured and sending email receipt')

                # Update the order
                combined_data = {**update_data}
                update_result = payments_collection.update_one(
                    {"payment_intent": payment_intent},
                    {"$set": combined_data}
                )

                if update_result.modified_count > 0:
                    # Delete both temp and cart data after successful payment
                    delete_temp = temp_payments_collection.delete_one({"payment_intent": payment_intent})
                    print(f"Deleted temp payment data: {delete_temp.deleted_count}")

                    delete_cart = cart_collection.delete_many({
                        "email_address": buyer_email,
                        "seller_email": seller_email,
                        "auction_id": auction_id
                    })
                    print(f"Deleted cart data: {delete_cart.deleted_count}")


                    seller = user_collection.find_one({"email_address": seller_email})
                    print('seller', seller)
                    buyer = buyer_collection.find_one({'email_address': buyer_email, "seller_email": seller_email})
                    print('buyer', buyer)
                    auction_data = auction.find_one({'_id': ObjectId(auction_id)})
                    print('auction', auction_data)
                    get_winning_lot = cart_collection.find(
                        {'buyer_id': str(buyer['_id']), 'auction_id': str(auction_id)},
                        {'_id': 0}
                    )

                    print('get winning lot', get_winning_lot)

                    # Convert cursor to list
                    if isinstance(get_winning_lot, list):
                        lots_list = get_winning_lot
                    elif hasattr(get_winning_lot, '__iter__'):
                        lots_list = list(get_winning_lot)
                    else:
                        lots_list = [get_winning_lot]

                    # Add CDN URL to lot images
                    for lot in lots_list:
                        if 'lot_image' in lot:
                            lot['lot_image'] = os.environ.get('CDN_URL') + lot['lot_image']

                    print("lot", lots_list)

                    # Handle timezone conversion
                    common_time_zone = auction_data.get('time_zone', 'UTC')
                    time_zone = TIMEZONE_MAPPING.get(common_time_zone, 'UTC')
                    try:
                        tz = pytz.timezone(time_zone)
                    except pytz.UnknownTimeZoneError:
                        tz = pytz.utc

                    end_date_time_in_milliseconds = auction_data.get('end_date', datetime.utcnow().timestamp() * 1000)
                    end_date_time_utc = datetime.utcfromtimestamp(end_date_time_in_milliseconds / 1000)
                    end_date_time_local = end_date_time_utc.replace(tzinfo=pytz.utc).astimezone(tz)
                    end_date = end_date_time_local.date()

                    # Prepare email template data
                    currency = existing_order.get("currency", "")
                    amount_paid = currency + ' ' + str(existing_order['amount'])
                    logo_img = f"{os.environ.get('CDN_URL')}Logo.png" if not auction_data['logo_image'] else os.environ["CDN_URL"] + auction_data["logo_image"]

                    seller_name = ' '.join(filter(None, [seller.get('first_name'), seller.get('last_name')])) or 'Seller'

                    template_data = {
                        "auction_title": existing_order['auction_title'],
                        "logo_image": logo_img,
                        "auction_end_date": end_date,
                        'account_name': ' '.join(filter(None, [
                            existing_order['billing_address']['first_name'],
                            existing_order['billing_address']['last_name']
                        ])),
                        "address_line1": existing_order['billing_address']['address_line1'],
                        "address_line2": existing_order['billing_address']['address_line2'],
                        "city": existing_order['billing_address']['city'],
                        "state": existing_order['billing_address']['state'],
                        "country": existing_order['billing_address']['country'],
                        "zip_code": existing_order['billing_address']['postal_code'],
                        "email_address": buyer_email,
                        "seller_name": seller_name,      
                        "currency": currency, 
                        "amount_paid": amount_paid,
                        "lots": lots_list,
                    }

                    # Send email receipt
                    try:
                        mailchimp = MailchimpTransactional.Client(os.environ['MAILCHIMP_SECRET_KEY'])
                        template_name = str(seller['_id']) + '-PAYMENT-RECEIPT-EMAIL'
                        mailchimp.templates.info({"name": template_name})
                    except ApiClientError as error:
                        template_name = 'default_payment-receipt'
                        print("An exception occurred: {}".format(error.text))

                    send_mailchimp_payment_email(
                        existing_order['email_address'],
                        template_name,
                        template_data,
                        os.environ['MAILCHIMP_ADDRESS']
                    )

                return update_result
            else:
                return None


       # Retrieve key information
        seller_email = temp_payment_details.get("seller_email")
        buyer_email = temp_payment_details.get("email_address")
        auction_id = temp_payment_details.get("auction_id")

        # Update the payment data
        update_result = temp_payments_collection.update_one(
            {"payment_intent": payment_intent},
            {"$set": update_data}
        )
        print('update_data', update_data)


        if update_data.get("payment_status") == "Approved":
            print('Creating order in the order table with Unpaid status')
            capture_order(payment_intent)

            # Create the order with Unpaid status
            combined_data = {**temp_payment_details, **update_data, "payment_status": "Unpaid"}
            insert_result = create_order(combined_data)

            if insert_result:
                # Only delete temp data after successful order creation
                delete_temp = temp_payments_collection.delete_one({"payment_intent": payment_intent})
                print(f"Deleted temp payment data: {delete_temp.deleted_count}")

                # Keep cart data until payment is completed


    except Exception as err:
        print(f"Unexpected {err=}, {type(err)=}")
        raise











def create_order(insert_data):
    """
    Add payment data to the MongoDB collection.

    Args:
        insert_data (dict): Dictionary containing payment data to be inserted.

    Returns:
        pymongo.results.InsertOneResult: The result of the MongoDB insert operation.
    """
    try:
        orders_collection = db[os.environ['ORDERS_COLLECTION']]
        insert_result = orders_collection.insert_one(insert_data)
        if insert_result:
            print("order created")
            return insert_result
        return None

    except Exception as err:
        print(f"Unexpected {err=}, {type(err)=}")
        raise




def capture_order(order_id):
    """Capture the payment for an existing PayPal order."""
    access_token = get_paypal_access_token()
    print('order_id', order_id)
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {access_token}"
    }

    response = requests.post(
        f"{PAYPAL_API_URL}/v2/checkout/orders/{order_id}/capture",
        headers=headers,
        json={}  # No body needed for capture
    )

    if response.status_code == 201:
        print("Order captured successfully:")
        # print(json.dumps(response.json(), indent=4))
    else:
        print("Failed to capture order:")
        # print(json.dumps(response.json(), indent=4))





def create(event, context):
    """
    AWS Lambda function entry point for handling PayPal webhook events.

    Parameters:
    - event (dict): AWS Lambda event object containing details of the invocation
    - context (object): AWS Lambda context object providing information about the runtime

    Returns:
    - dict: HTTP response containing status code, headers, and body
    """
    try:
        try:
            webhook_event = json.loads(event["body"])
            print(f"Received event: {webhook_event['event_type']}")

            try:
                if webhook_event["event_type"] == "CHECKOUT.ORDER.APPROVED":
                    payment_intent = webhook_event["resource"]["id"]
                    update_data = {
                        "status": webhook_event["resource"]["status"],
                        "payment_status": "Approved" if webhook_event["resource"]["status"] == "APPROVED" else "pending",
                        "payment_method_types": ["paypal"]
                    }
                    update_order(payment_intent, update_data)
                    return {
                        "headers": headers,
                        "statusCode": 200,
                        "body": json.dumps({"message": "Order updated successfully"})
                    }
                elif webhook_event["event_type"] == "CHECKOUT.ORDER.COMPLETED":
                    print('webhook after completed', json.dumps(webhook_event))
                    payment_intent = webhook_event["resource"]["id"]
                    print('order id', payment_intent)
                    print('here in order completd')
                    update_data = {
                        "status": "succeeded",
                        "payment_status": "Paid",
                        "payment_method_types": ["paypal"]
                    }
                    update_order(payment_intent, update_data)
                    return {
                        "headers": headers,
                        "statusCode": 200,
                        "body": json.dumps({"message": "Payment captured successfully"})
                    }
                else:
                    print(f"Unhandled event type: {webhook_event['event_type']}")
                    return {
                        "headers": headers,
                        "statusCode": 400,
                        "body": json.dumps({"message": "Unhandled event type"})
                    }

            except Exception as err:
                print(f"Error processing webhook: {str(err)}")
                return {
                    "headers": headers,
                    "statusCode": 400,
                    "body": json.dumps({"message": "Error processing webhook"})
                }

        except Exception as err:
            print(f"Error processing webhook: {str(err)}")
            return {
                "headers": headers,
                "statusCode": 400,
                "body": json.dumps({"message": "Error processing webhook"})
            }

    except Exception as err:
        print(f"Error processing the request: {str(err)}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "There was an error while updating payment data"})
        }