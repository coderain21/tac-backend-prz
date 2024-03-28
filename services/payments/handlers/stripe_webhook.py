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
        # MongoDB configuration
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        temp_payments_collection = db[os.environ['TEMP_ORDERS_COLLECTION']]
        payments_collection = db[os.environ['ORDERS_COLLECTION']]
        cart_collection = db[os.environ['CART_COLLECTION']]
        # print(update_data)

        # update_result = payments_collection.update_one({"payment_intent": id},{"$set": update_data})

        temp_payment_details = temp_payments_collection.find_one({"payment_intent": payment_intent_id})
        print('payment_details', temp_payment_details)

        if temp_payment_details:
            # Retrieve seller email, buyer email, and auction ID
            seller_email = temp_payment_details.get("seller_email")
            buyer_email = temp_payment_details.get("email_address")
            auction_id = temp_payment_details.get("auction_id")

            # # Create the order using the temporary payment data
            # insert_result = create_order(temp_payment_details)

            # Update the payment data
            update_result = temp_payments_collection.update_one({"payment_intent": payment_intent_id}, {"$set": update_data})
            print('update_data', update_data)

            # Check if the payment status is "Paid"
            if update_data.get("payment_status") == "Paid":

                combined_data = {**temp_payment_details, **update_data}

                # Create the order using the temporary payment data
                insert_result = create_order(combined_data)
                delete_temp = temp_payments_collection.delete_one({"payment_intent": payment_intent_id})
                print('here')
                # Delete the cart data
                cart_collection.delete_many({"email_address": buyer_email,"seller_email": seller_email,"auction_id": auction_id})
            elif update_data.get('payment_status') == 'Unpaid' and update_data.get('last_payment_error'):
                # Create the order using the temporary payment data
                combined_data = {**temp_payment_details, **update_data}

                insert_result = create_order(combined_data)
                delete_temp = temp_payments_collection.delete_one({"payment_intent": payment_intent_id})
                print('here')
                # Delete the cart data
                cart_collection.delete_many({"email_address": buyer_email,"seller_email": seller_email,"auction_id": auction_id})
                print('after')
            client.close()
            return update_result

        else:
            # If payment details are not found, return None
            client.close()
            return None


        # client.close()
        # if update_result:
        #     return update_result
        # return None
    except BaseException as err:
        client.close()
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
        # MongoDB configuration
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        orders_collection = db[os.environ['ORDERS_COLLECTION']]

        insert_result = orders_collection.insert_one(insert_data)
        if insert_result:
            print("order created")
        client.close()

        if insert_result:
            return insert_result

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
        print('data after payment', data)
        # Handle the event
        if data["object"]["object"] == "payment_intent":
            payment_id = data["object"]["id"]
            payment_method = data["object"]["payment_method"]
            # if payment_method is not None:
            #     payment_method = stripe.PaymentMethod.retrieve(payment_id,
                                                    #   stripe_account = account_id)
                # print(payment_method)
            update_data= {
                "status": data["object"]["status"],
                "payment_status": "Paid" if data["object"]["status"] == "succeeded" else "Unpaid",
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