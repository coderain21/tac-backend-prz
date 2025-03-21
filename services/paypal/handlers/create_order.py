'''This function is used to create the order in paypal'''
from datetime import datetime
import decimal
import json
import os
from bson import ObjectId
import requests
from pymongo import MongoClient
from lib.paypal_helper import get_paypal_access_token

# Constants
PAYPAL_API_URL = os.environ["PAYPAL_URL"]  # Use live URL for production
CLIENT_ID = os.environ["PAYPAL_CLIENT_ID"]
CLIENT_SECRET = os.environ["PAYPAL_CLIENT_SECRET"]

# MongoDB setup
client = MongoClient(
    os.environ['MONGO_CLIENT'],
    maxIdleTimeMS=60000
)
db = client[os.environ['DATABASE']]
counter_collection = db[os.environ['COUNTER_LOT']]
address_collection = db[os.environ["ADDRESS_COLLECTION"]]
orders_collection = db[os.environ["TEMP_ORDERS_COLLECTION"]]
cart_collection = db[os.environ["CART_COLLECTION"]]
auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
seller_collection = db[os.environ["SELLERS_TABLE"]]
buyer_collection = db[os.environ["BUYER_COLLECTION"]]
payment_status = db[os.environ['PAYMENT_STATUS']]


# JSON encoder for special types
class Encoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, (decimal.Decimal, bytes)):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        if isinstance(o, ObjectId):
            return str(o)  # Convert ObjectId to string
        return super().default(o)


# PayPal access token retrieval
def get_access_token():
    response = requests.post(
        f"{PAYPAL_API_URL}/v1/oauth2/token",
        auth=(CLIENT_ID, CLIENT_SECRET),
        data={'grant_type': 'client_credentials'}
    )
    response.raise_for_status()
    return response.json()['access_token']

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

# Generate order code with padding
def generate_order_code(number):
    if not isinstance(number, int) or number < 1:
        raise ValueError("Input must be a positive integer greater than 0.")
    return f"OD{str(number).zfill(3)}"

# Retrieve cart data for the buyer and seller
def get_data_from_cart(auction_id, seller_email, buyer_email):
    cart_data = cart_collection.find({
        "email_address": buyer_email,
        "seller_email": seller_email,
        "auction_id": auction_id
    })
    cart_list = list(cart_data)
    results, lot_numbers = [], []

    for lot in cart_list:
        results.append({
            "bid_amount": lot.get("bid_amount"),
            "fees": lot.get("fees"),
            "percentage": lot.get("percentage"),
            "lot_title": lot.get("lot_title"),
            "lot_number": lot.get("lot_number"),
            "lot_image": lot.get("lot_image"),
            "auction_id": lot.get("auction_id"),
            "name": lot.get("name"),
            "currency": lot.get("currency")
        })
        lot_numbers.append(lot.get("lot_number"))

    return results, lot_numbers

# Calculate application fee based on plan type
def calculate_application_fee(amount, plan_type):
    fees = {"Starter": 0.06, "Pro": 0.09, "Free": 0}
    return round(amount * fees.get(plan_type, 0), 2)


# Add payment data to MongoDB
def create_order(insert_data):
    print('data', json.dumps(insert_data, cls=Encoder))
    insert = orders_collection.insert_one(insert_data)
    return True

# Create a PayPal order
def generate_paypal_order(payment_info, redirect_url):
    currency = payment_info.get("currency")
    amount = payment_info.get("amount")
    seller_email = payment_info.get("seller_email")
    return_url = redirect_url.get('return_url')
    cancel_url = redirect_url.get('cancel_url')
    access_token = get_access_token()
    cart_items = payment_info.get("cart_items", [])
    application_fee = payment_info.get("application_fee", 0)
    account_id = payment_info.get("account_id")

    items = []
    for item in cart_items:
        items.append({
            "name": item.get("lot_title", "Auction Lot"), 
            "description": f"Lot #{item.get('lot_number', '')}",
            "unit_amount": {
                "currency_code": item.get("currency", currency),
                "value": str(item.get("bid_amount", 0))
            },
            "quantity": "1",
            "category": "PHYSICAL_GOODS"
        })
    order_data = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "amount": {
                "currency_code": currency,
                "value": str(amount),
                "breakdown": {
                    "item_total": {
                        "currency_code": currency,
                        "value": str(amount)
                    }
                }
            },
            "items": items,
            "payee": {"merchant_id": account_id, "email_address": seller_email},
            "payment_instruction": {
                "platform_fees": [{
                    "amount": {
                        "currency_code": currency,
                        "value": str(application_fee)
                    }
                }]
            }
        }],
        "application_context": {
            "landing_page": "BILLING",
            "shipping_preference": "NO_SHIPPING", 
            "user_action": "PAY_NOW",
            "return_url": return_url,
            "cancel_url": cancel_url
        }
    }
    print(json.dumps(order_data, indent=4))
    response = requests.post(
        f"{PAYPAL_API_URL}/v2/checkout/orders",
        headers={
            "Content-Type": "application/json",
            'PayPal-Partner-Attribution-Id': os.environ["PAYPAL_BN_CODE"],
            "Authorization": f"Bearer {access_token}"
        },
        json=order_data
    )

    if response.status_code not in [200, 201]:
        print(f"Error: {response.status_code}")
        print(f"Response: {response.text}")

    response.raise_for_status()
    return response.json()




def create_paypal_order(event, context):
    """
    Create a PayPal payment order.

    Args:
        event (dict): The event data from the API gateway.
        context (object): The context object.

    Returns:
        dict: The API response containing PayPal order data.
    """
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
            print('email', email_address)
        except:
            print('here in second')
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        data = event['queryStringParameters']
        expected_fields = ["id", "domain", "amount", "billing", "shipping", "timestamp"]
        fields_not_found = list(set(expected_fields).difference(data.keys()))

        if fields_not_found:
            return {"headers": headers,
                    'statusCode': 400,
                    "body": json.dumps({"message": f"Please provide {','.join(fields_not_found)}"})
                    }

        auction_id = data.get("id")
        amount = int(float(data.get("amount")))
        billing = data.get("billing")
        shipping = data.get("shipping")
        return_url = data.get("return_url" )
        cancel_url = data.get("cancel_url")
        if not return_url or not cancel_url:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide return_url and cancel_url"})
            }


        payment = data.get("payment")

        time_stamp = int(data.get("timestamp"))
        print('data', auction_id, amount, billing, shipping)

        # Fetch seller data
        seller_data_of_auction = auction_collection.find_one({'_id': ObjectId(auction_id)})
        # print('seller data of auction', seller_data_of_auction)
        if seller_data_of_auction is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Auction doesn't exist"})
            }


        auction_title = seller_data_of_auction.get("title")
        auction_image = seller_data_of_auction.get("auction_image")
        seller_email = seller_data_of_auction["seller_email"]
        seller_data = seller_collection.find_one({'email_address': seller_email})

        payment_processing = payment_status.find_one({'auction_id': auction_id, 'seller_email': seller_email, 'email_address': email_address})
        print('payment_processing', payment_processing)
        if payment_processing:
            order_id = payment_processing['id']
            print('order id', order_id)
            check_order_status = order_status(order_id)
            print('check order', check_order_status)
            # return
            if check_order_status['status'] in ['APPROVED','COMPLETED']:
                # payment_status.delete_one(
                # {
                #     "email_address": email_address,
                #     "seller_email": seller_email,
                #     "auction_id": auction_id
                # })
                payment_status.update_one(
                    {'_id': payment_processing['_id']},
                    {'$set': {'payment_status': 'Paid or Approved'}}
                )
                return{
                    "statusCode": 400,
                    "headers": headers,
                    "body": json.dumps({"message": "Order is already created"})
                }
        # print('seller data', seller_data)
        if seller_data is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Seller not found"})
            }

        plan_type = seller_data.get("plan_type", "")
        application_fee = calculate_application_fee(amount, plan_type)

        insert_data = {}


        if payment == "paypal":


            account_id = seller_data.get("paypal_connected_id", None)
            if account_id is None:
                return {
                    "statusCode": 400,
                    "headers": headers,
                    "body": json.dumps({'message': 'Seller does not have paypal account,please connect'}, cls=Encoder)
                }
            paypal_account_status = seller_data.get("paypal_status", "")
            if paypal_account_status != "connected":
                return {
                    "statusCode": 400,
                    "headers": headers,
                    "body": json.dumps({'message': 'Seller has disconnected their paypal account,please connect'}, cls=Encoder)
                }

            cart_data,res = get_data_from_cart(auction_id,seller_email,email_address)

            payment_info = {
                "amount": amount,
                "currency": seller_data_of_auction["currency"],
                "application_fee": application_fee,
                "account_id": account_id,
                "seller_email": seller_email,
                "cart_items": cart_data
            }

            redirect_urls = {
                "return_url": return_url,
                "cancel_url": cancel_url
            }

            paypal_order = generate_paypal_order(payment_info, redirect_urls)



            insert_data = {
                "email_address": email_address,
                "payment_intent": paypal_order["id"],
                "status": paypal_order['status'],
                "payment_status": "Unpaid",
                "amount": amount,
                "auction_id": auction_id,
                "seller_email": seller_email,
                "plan_type": plan_type
            }


        #fetch address data and add to order data
        billing_address = address_collection.find_one({"_id": ObjectId(billing)})
        shipping_address = address_collection.find_one({"_id": ObjectId(shipping)})





        existing_orders_count = orders_collection.count_documents(
            {"seller_email": seller_email,"email_address": email_address, "auction_id": auction_id})
        counter_record = counter_collection.find_one({"auction_id": auction_id,
                                                      "email_address": email_address,
                                                      "seller_email": seller_email,
                                                      'record_type': 'Orders'}
                                                     )
        if counter_record is None:
            last_order_number = 0
            counter_record = {
                "auction_id": auction_id,
                "seller_email": seller_email,
                "email_address": email_address,
                "record_type": "Orders",
                "starting_sequence": last_order_number
            }
            result = counter_collection.insert_one(counter_record)


        last_order_number = counter_record["starting_sequence"]+1
        update_data = {
            "starting_sequence": last_order_number
        }
        insert_data["order_number"] = generate_order_code(last_order_number)



        insert_data = {
            "email_address": email_address,
            "payment_intent": paypal_order['id'],
            "status": paypal_order['status'],
            "payment_status": "Unpaid",
            "amount": amount,
            "payment": "Paypal",
            "application_amount": application_fee,
            "currency": seller_data_of_auction["currency"],
            "seller_email": seller_email
        }


        insert_data["purchases"] = cart_data
        insert_data["lots"] = res
        insert_data["created_at"] = time_stamp
        insert_data["auction_title"] = auction_title
        insert_data["auction_image"] = auction_image
        insert_data["order_number"] = generate_order_code(last_order_number)
        insert_data["shipping_address"] = shipping_address
        insert_data["billing_address"] = billing_address
        insert_data['auction_id'] = auction_id


        print('insert data', insert_data)



        buyer_data = buyer_collection.find_one({"seller_email":seller_email,"email_address":email_address})
        name = ""
        if buyer_data is not None:
            f_name = buyer_data.get("first_name","")
            l_name = buyer_data.get("last_name","")
            name = f_name+' '+l_name
        insert_data["name"] = name

        insert_data['payment_method_types'] = ["PayPal"]

        create_order(insert_data)

        payment_process = payment_status.find_one_and_update(
                {
                    "email_address": email_address,
                    "seller_email": seller_email,
                    "auction_id": auction_id
                },
                {
                    "$set": {
                        "payment_status": "Unpaid",
                        **paypal_order
                    }
                },
                upsert=True  # Move upsert here as a parameter
            )




        counter_collection.update_one({"auction_id": auction_id,
                                    "seller_email": seller_email,
                                    "email_address": email_address,
                                    "record_type": "Orders"}, {"$set": update_data})


        return {
            "statusCode": 201,
            "headers": headers,
            "body": json.dumps({"paypal_intent_id": paypal_order['id'],
                                "confirmation_url": paypal_order['links'][1]['href']}, cls=Encoder)
        }

    except Exception as err:
        print(f"Unexpected error: {err}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "Internal server error"})
        }


def order_status(order_id):
    '''Get order status'''
    access_token = get_paypal_access_token()
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {access_token}"
    }

    response = requests.get(
        f"{PAYPAL_API_URL}/v2/checkout/orders/{order_id}",
        headers=headers
    )

    print('response in order capture', response)

    if response.status_code == 200:
        print("Order status:", response.json())
    else:
        print("Failed to get order status:", response.json())

    return response.json()
