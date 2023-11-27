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
from lib.common_helper import Encoder
from lib.get import get_by_email, fetch_seller_data_from_auction

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}
stripe.api_key = os.environ["STRIPE_API_KEY"]


def calculate_application_fee(amount, plan_type):
    """
    Calculate the application fee based on the plan type.

    Args:
        amount (int): The payment amount.
        plan_type (str): The plan type of the seller.

    Returns:
        float: The calculated application fee.
    """
    if plan_type == "Starter":
        application_fee = amount * 0.06
    elif plan_type == "Free":
        application_fee = amount * 0
    elif plan_type == "Pro":
        application_fee = amount * 0.09
    else:
        application_fee = amount * 0
    return application_fee


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
            stripe_account=account_id,
        )
        print(session)
        return session
    except Exception as err:
        print(f"Unexpected {err=}, {type(err)=}")
        raise


def add_payment_data_to_collection(insert_data):
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
        collection_sellers = db[os.environ['PAYMENTS_COLLECTION']]
        print(insert_data)
        insert_result = collection_sellers.insert_one(insert_data)
        print(insert_result)
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

        data = event['queryStringParameters']
        expected_fields = ["id", "domain", "amount"]
        fields_not_found = list(set(expected_fields).difference(data.keys()))
        if fields_not_found:
            return {"headers": headers,
                    'statusCode': 400,
                    "body": json.dumps(
                        {"message": f"Please provide {','.join(fields_not_found)}"})
                    }

        sub_domain = data.get("domain")
        auction_id = data.get("id")
        amount = int(data.get("amount"))

        seller_data_of_auction = fetch_seller_data_from_auction(auction_id)
        if seller_data_of_auction is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Auction doesn't exists"})
            }
        seller_data = get_by_email(
            seller_data_of_auction["seller_email"], os.environ['SELLERS_TABLE'])
        print(seller_data)
        if seller_data is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Seller not found"})
            }
        plan_type = seller_data.get("plan_type", "")
        account_id = seller_data.get("stripe_connected_id")
        if account_id is None:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({'message': 'Seller does not have stripe account,please connect'}, cls=Encoder)
            }
        account_status = seller_data.get("stripe_status", "")
        if account_status != "connected":
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({'message': 'Seller has disconnected their stripe account,please connect'}, cls=Encoder)
            }
        application_fee = calculate_application_fee(amount, plan_type)
        stripe_data = generate_client_secret(
            account_id, amount, seller_data_of_auction["currency"], application_fee)
        insert_data = {
            "email_address": email_address,
            "id": stripe_data["id"],
            "client_secret": stripe_data["client_secret"],
            "status": stripe_data["status"],
            "application_amount": stripe_data["application_fee_amount"],
            "currency": stripe_data["currency"],
            "seller_email": seller_data_of_auction["seller_email"]
        }
        add_payment_data_to_collection(insert_data)
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data': stripe_data["client_secret"], 'account_id': account_id}, cls=Encoder)
        }
    except Exception as err:
        print(err)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "There was an error while generating payment data"})
        }
