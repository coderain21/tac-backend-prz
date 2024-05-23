'''
This module provides an API for retrieving buyer details, creating payment intents,
and handling payment-related operations.

It includes functions for calculating application fees, generating client secrets,
adding payment data to a MongoDB collection, and creating payment intents.
'''
import json
import os
import stripe
from pymongo import MongoClient
from bson import ObjectId
from lib.common_helper import Encoder
from lib.get import get_by_email, fetch_seller_data_from_auction, fetch_buyer_data

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}
stripe.api_key = os.environ["STRIPE_API_KEY"]

def generate_order_code(number):
    if not isinstance(number, int) or number < 1:
        raise ValueError("Input must be a positive integer greater than 0.")

    # Define the prefix for the code
    prefix = "OD"

    # Determine the number of digits in the input number
    num_digits = len(str(number))

    # Calculate the padding needed for the code
    padding = max(0, 3 - num_digits)

    # Generate the formatted code
    formatted_code = f"{prefix}{padding*'0'}{number}"

    return formatted_code

def get_data_from_cart(auction_id,seller_email,buyer_email):
    try:
        # MongoDB configuration
        results = []
        lot_numbers = []
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        cart_collection = db[os.environ["CART_COLLECTION"]]
        res = ""
        cart_data = cart_collection.find({"email_address": buyer_email,"seller_email": seller_email,"auction_id": auction_id})
        if cart_data is None:
            return [],[]
        cart_list = list(cart_data)
        for lot in cart_list:
            record = {}
            record["bid_amount"] = lot.get("bid_amount")
            record["fees"] = lot.get("fees")
            record["percentage"] = lot.get("percentage")
            record["lot_title"] = lot.get("lot_title")
            record["lot_number"] = lot.get("lot_number")
            lot_numbers.append(lot.get("lot_number"))
            record["lot_image"] = lot.get("lot_image")
            record["auction_id"] = lot.get("auction_id")
            record["name"] = lot.get("name")
            record["currency"] = lot.get("currency")
            results.append(record)

        # cart_collection.delete_many({"email_address": buyer_email,"seller_email": seller_email,"auction_id": auction_id})
        client.close()
        if cart_data:
            return results,lot_numbers
        return None
    except BaseException as err:
        client.close()
        print(f"Unexpected {err=}, {type(err)=}")
        raise

def calculate_application_fee(amount, plan_type):
    """
    Calculate the application fee based on the plan type.

    Args:
        amount (int): The payment amount.
        plan_type (str): The plan type of the seller.

    Returns:
        float: The calculated application fee.
    """
    try:
        if plan_type == "Starter":
            application_fee = amount * 0.06
        elif plan_type == "Free":
            application_fee = amount * 0
        elif plan_type == "Pro":
            application_fee = amount * 0.09
        else:
            application_fee = amount * 0
        return application_fee
    except BaseException as err:
        print('err', err)

def generate_client_secret(account_id, amount, currency, application_fee):
    """
    Generate a client secret for the payment intent.

    Args:
        account_id (str): The Stripe account ID of the seller.
        amount (int): The payment amount.
        currency (str): The currency code.
        application_fee (float): The application fee.

    Returns:
        dict: The payment intent session data.
    """
    try:
        session = stripe.PaymentIntent.create(
            amount=amount*100,
            currency=currency,
            automatic_payment_methods={"enabled": True},
            application_fee_amount=int(application_fee*100),
            stripe_account=account_id
        )
        return session
    except Exception as err:
        print('errr', err)

def create_order(insert_data):
    """
    Add payment data to the MongoDB collection.

    Args:
        client_secret (str): The client secret of the payment intent.
        id (str): The payment intent ID.
        status (str): The status of the payment.
        email_address (str): The email address of the buyer.
        application_amount (float): The payment amount.
        currency (str): The currency code.
        seller_email (str): The email address of the seller.

    Returns:
        pymongo.results.InsertOneResult: The result of the MongoDB insert operation.
    """
    try:
        # MongoDB configuration
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        payments_collection = db[os.environ['TEMP_ORDERS_COLLECTION']]
        insert_result = payments_collection.insert_one(insert_data)
        client.close()
        if insert_result:
            return insert_result
        return None
    except BaseException as err:
        client.close()
        print(f"Unexpected {err=}, {type(err)=}")
        raise


def create_intent(event, context):
    """
    Create a payment intent.

    Args:
        event (dict): The event data from the API gateway.
        context (object): The context object.

    Returns:
        dict: The API response containing payment intent data.
    """
    try:
        try:
            cognito_data = json.loads(
                event['requestContext']['authorizer']['data'])
            email_address = cognito_data['email']
            if "cognito:groups" not in cognito_data :
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
        expected_fields = ["id", "domain", "amount","billing","shipping","timestamp"]
        fields_not_found = list(set(expected_fields).difference(data.keys()))
        if fields_not_found:
            return {"headers": headers,
                    'statusCode': 400,
                    "body": json.dumps(
                        {"message": f"Please provide {','.join(fields_not_found)}"})
                    }
        body_data = {}
        sub_domain = data.get("domain")
        auction_id = data.get("id")
        amount = int(float(data.get("amount")))
        billing = data.get("billing")
        shipping = data.get("shipping")
        time_stamp = int(data.get("timestamp"))
        payment= data.get("payment")
        seller_data_of_auction = fetch_seller_data_from_auction(auction_id)
        if seller_data_of_auction is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Auction doesn't exists"})
            }
        auction_title = seller_data_of_auction.get("title")
        auction_image = seller_data_of_auction.get("auction_image")
        seller_email = seller_data_of_auction["seller_email"]
        seller_data = get_by_email(
            seller_data_of_auction["seller_email"], os.environ['SELLERS_TABLE'])
        if seller_data is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Seller not found"})
            }
        plan_type = seller_data.get("plan_type", "")
        application_fee = calculate_application_fee(amount, plan_type)
        if payment == "stripe":
            account_id = seller_data.get("stripe_connected_id")
            if account_id is None:
                return {
                    "statusCode": 400,
                    "headers": headers,
                    "body": json.dumps({'message': 'Seller does not have stripe account,please connect'}, cls=Encoder)
                }
            stripe_account_status = seller_data.get("stripe_status", "")
            if stripe_account_status != "connected":
                return {
                    "statusCode": 400,
                    "headers": headers,
                    "body": json.dumps({'message': 'Seller has disconnected their stripe account,please connect'}, cls=Encoder)
                }

            stripe_data = generate_client_secret(
                account_id, amount, seller_data_of_auction["currency"], application_fee)
            insert_data = {
                "email_address": email_address,
                "payment_intent": stripe_data["id"],
                "client_secret": stripe_data["client_secret"],
                "status": stripe_data["status"],
                "payment_status": "Unpaid",
                "amount": amount,
                "payment": "Stripe",
                "application_amount": application_fee,
                "currency": seller_data_of_auction["currency"],
                "seller_email": seller_data_of_auction["seller_email"]
            }
            body_data = {'data': stripe_data["client_secret"], 'account_id': account_id}
        elif payment == "paypal":
            insert_data = {
                "email_address": email_address,
                "payment_intent": "",
                "client_secret": "",
                "status": "",
                "payment_status": "Unpaid",
                "amount": amount,
                "payment": "Paypal",
                "application_amount": application_fee,
                "currency": seller_data_of_auction["currency"],
                "seller_email": seller_data_of_auction["seller_email"]
            }
        else:
            insert_data = {
                "email_address": email_address,
                "payment_intent": "",
                "client_secret": "",
                "status": "",
                "payment_status": "Unpaid",
                "amount": amount,
                "payment": "",
                "application_amount": application_fee,
                "currency": seller_data_of_auction["currency"],
                "seller_email": seller_data_of_auction["seller_email"]
            }

        #Block to fetch the counter record , add the order to orders
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]

        counter_collection = db[os.environ['COUNTER_LOT']]
        address_collection = db[os.environ["ADDRESS_COLLECTION"]]
        orders_collection = db[os.environ["TEMP_ORDERS_COLLECTION"]]

        #fetch address data and add to order data
        billing_address = address_collection.find_one({"_id": ObjectId(billing)})
        shipping_address = address_collection.find_one({"_id": ObjectId(shipping)})
        insert_data["shipping_address"] = shipping_address
        insert_data["billing_address"] = billing_address


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
        buyer_data = fetch_buyer_data(seller_email,email_address)
        name = ""
        if buyer_data is not None:
            f_name = buyer_data.get("first_name","")
            l_name = buyer_data.get("last_name","")
            name = f_name+' '+l_name
        cart_data,res = get_data_from_cart(auction_id,seller_email,email_address)
        insert_data["created_at"] = time_stamp
        insert_data["auction_title"] = auction_title
        insert_data["auction_image"] = auction_image
        insert_data["purchases"] = cart_data
        insert_data["lots"] = res
        insert_data["auction_id"] = auction_id
        insert_data["name"] = name

        #add the order data in orders collection
        orderCreate = create_order(insert_data)
        counter_collection.update_one({"auction_id": auction_id,
                                       "seller_email": seller_email,
                                       "email_address": email_address,
                                       "record_type": "Orders"}, {
            "$set": update_data})

        return {
            "statusCode": 201,
            "headers": headers,
            "body": json.dumps(body_data, cls=Encoder)
        }
    except Exception as err:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "There was an error while generating payment data"})
        }
