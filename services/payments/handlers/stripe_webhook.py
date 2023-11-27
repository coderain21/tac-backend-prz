import json
import os
import stripe
import base64
from pymongo import MongoClient

stripe.api_key = os.environ["STRIPE_API_KEY"]
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': False,
}
# This is your Stripe CLI webhook secret for testing your endpoint locally.
endpoint_secret = 'whsec_3nPHZY45QpYXFyJG4HGyPe9K1Ni2F4hI'

def update_payment_data(id,update_data):
    try:
        # MongoDB configuration
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        payments_collection = db[os.environ['PAYMENTS_COLLECTION']]
        print(update_data)

        update_result = payments_collection.update_one({"id": id},{"$set": update_data})

        client.close()
        if update_result:
            return update_result
        return None
    except BaseException as err:
        client.close()
        print(f"Unexpected {err=}, {type(err)=}")
        raise

def update(event, context):
    try:
        print(event)
        # Lambda function entry point
        try:
            payload = event['body']
            print(1,event['body'])
            sig_header = event['headers']['Stripe-Signature']

            # Verify the Stripe webhook signature
            event = stripe.Webhook.construct_event(
                payload, sig_header, endpoint_secret
            )
            print(3)
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
        print(2)
        event_body = payload
        print(event_body)
        print(0)
        data = json.loads(event_body)
        print("data",data)
        data=data["data"]
        # Handle the event
        if data["object"]["object"] == "payment_intent":
            payment_id = data["object"]["id"]

            update_data= {
                "status": data["object"]["status"]
            }
            update_payment_data(payment_id,update_data)

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