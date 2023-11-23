'''this api will retrieve the detail of the buyers'''
import json
import os
import stripe
from pymongo import MongoClient
from bson import ObjectId
from lib.common_helper import Encoder
from lib.get import get_by_email,fetch_seller_data_from_auction

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}
stripe.api_key = "sk_test_51NSrthFdWS7wL4EMgIaIlyzCIPY2387pcfibXJdCWsVJWg1dHrjAHZIoeKTrOCNcUNqkAmEuGNQti3q0mcE3hThb00CCZpfg5S"
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
        
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["BUYER_COLLECTION"]]
        sub_domain = data.get("domain")
        auction_id = data.get("id")
        seller_data_of_auction = fetch_seller_data_from_auction(auction_id)
        if seller_email
        seller_data = get_by_email(seller_email,os.environ['SELLER_TABLE'])
        if result is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "user not found"})
            }
        return{
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data':result},cls=Encoder)
            }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": e}, cls=Encoder)
            }