"""
Module: stripe_webhook_handler

This module defines a Stripe webhook handler implemented as an AWS Lambda function.
The function is responsible for updating payment data in a MongoDB database based on
events received from the Stripe payment system.
"""
import json
import os
import stripe
from pymongo import MongoClient

stripe.api_key = os.environ["STRIPE_API_KEY"]
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': False,
}
# This is your Stripe CLI webhook secret for testing your endpoint locally.
endpoint_secret = os.environ['STRIPE_ENDPOINT_SECRET']

def update_payment_data(id,update_data):
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
        # Handle the event
        if data["object"]["object"] == "payment_intent":
            payment_id = data["object"]["id"]
            payment_method = data["object"]["payment_method"]
            if payment_method is not None:
                payment_method = stripe.PaymentMethod.retrieve(payment_id,
                                                       stripe_account = account_id)
                # print(payment_method)
            update_data= {
                "status": data["object"]["status"],
                "payment_method_types": data["object"]["payment_method_types"]
            }
            if data["object"]["last_payment_error"] is not None:
                update_data["last_payment_error"]= {
                    "message": data["object"]["last_payment_error"]["message"],
                    "decline_code": data["object"]["last_payment_error"]["decline_code"]
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