'''this api will retrieve the detail of the buyers'''
import json
import os
import stripe
from pymongo import MongoClient
from bson import ObjectId
from lib.common_helper import Encoder
from lib.get import get_by_email,fetch_seller_data_from_auction,fetch_buyer_data

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}
stripe.api_key = os.environ["STRIPE_API_KEY"]

def calculate_application_fee():
    pass

def generate_client_secret(account_id,amount,currency,application_fee):
    session  = stripe.PaymentIntent.create(
        amount=amount,
        currency=currency,
        automatic_payment_methods={"enabled": True},
        application_fee_amount=application_fee,
        stripe_account=account_id,
        )
    print(session)
    print(session['client_secret'])
    return session['client_secret']


def create_intent(event, context):
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
        
        data = event['queryStringParameters']
        expected_fields = ["id", "domain","amount"]
        fields_not_found = list(set(expected_fields).difference(data.keys()))
        if fields_not_found:
            return {"headers": headers,
                    'statusCode': 400,
                    "body": json.dumps(
                        {"message": f"Please provide {','.join(fields_not_found)}"})
                    }


        sub_domain = data.get("domain")
        auction_id = data.get("id")
        amount = data.get("amount")
        seller_data_of_auction = fetch_seller_data_from_auction(auction_id)
        if seller_data_of_auction is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Auction doesn't exists"})
            }
        seller_data = get_by_email(seller_data_of_auction["seller_email"],os.environ['SELLER_TABLE'])
        if seller_data is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Seller not found"})
            }
        account_id = seller_data["stripe_connected_id"]
        account_status = seller_data.get("stripe_status","")
        if account_status!="connected":
            return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({'message':'Seller has disconnected their stripe account,please connect'},cls=Encoder)
            }
        application_fee = calculate_application_fee()
        client_secret = generate_client_secret(account_id,amount,seller_data_of_auction["currency"],application_fee)
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data':client_secret},cls=Encoder)
            }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": e}, cls=Encoder)
            }