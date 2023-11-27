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

def calculate_application_fee(amount,plan_type):
    if plan_type == "Starter":
        application_fee = amount * 0.06
    elif plan_type == "Free":
        application_fee = amount * 0
    elif plan_type == "Pro":
        application_fee = amount * 0.09
    else:
        application_fee = amount * 0
    return application_fee

def generate_client_secret(account_id,amount,currency,application_fee):
    try:
        session  = stripe.PaymentIntent.create(
            amount=amount,
            currency=currency,
            automatic_payment_methods={"enabled": True},
            application_fee_amount=application_fee,
            stripe_account=account_id,
            )
        print(session)
        return session
    except Exception as err:
        print(f"Unexpected {err=}, {type(err)=}")
        raise

def add_payment_data_to_collection(client_secret,id,status,email_address,application_amount,currency):
    try:
        # MongoDB configuration
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection_sellers = db['PAYMENT_COLLECTION']
        insert_data = {
            "email_address" : email_address,
            "id": id,
            "client_secret": client_secret,
            "status": status,
            "application_amount": application_amount,
            "currency": currency
        }
        insert_result = collection_sellers.insert_one(insert_data)
        
        client.close()
        if insert_result:
            return insert_result
        return None
    except BaseException as err:
        client.close()
        print(f"Unexpected {err=}, {type(err)=}")
        raise

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
        plan_type = seller_data.get("plan_type","")
        account_id = seller_data["stripe_connected_id"]
        account_status = seller_data.get("stripe_status","")
        if account_status!="connected":
            return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({'message':'Seller has disconnected their stripe account,please connect'},cls=Encoder)
            }
        application_fee = calculate_application_fee(amount,plan_type)
        stripe_data = generate_client_secret(account_id,amount,seller_data_of_auction["currency"],application_fee)
        add_payment_data_to_collection(stripe_data["client_secret"],stripe_data["id"],stripe_data["status"],email_address,stripe_data["application_amount"],stripe_data["currency"])
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data':stripe_data["client_secret"],'account_id':account_id},cls=Encoder)
            }
    except Exception as err:
        print(err)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "There was an error while generating payment data"})
            }