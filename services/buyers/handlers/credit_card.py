''' this api will validate the credit card'''
import json
import stripe
from pymongo import MongoClient
import os
from bson import ObjectId

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db['dev-credit_card']


def credit_card(event, context):
    """
    The `credit_card` function handles the verification and storage of credit card information using the
    Stripe API.
    :param event: The `event` parameter is a dictionary that contains information about the HTTP request
    that triggered the function. It typically includes details such as the request method, headers,
    query parameters, and request body
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, the function name, the
    function version, and more. This parameter is typically not used in the code you provided, but it
    can be useful for logging or
    :return: a JSON response with a status code, headers, and a body. The specific response depends on
    the execution path of the code. Here are the possible return values:
    """
    # Parse the request body to get the token and buyer_id
    data = event['queryStringParameters']
    buyer_id= data['buyer_id']
    buyer_id = ObjectId(buyer_id)
    auction_id = data['auction_id']
    auction_id =ObjectId(auction_id)
    # Set your Stripe API key
    stripe.api_key = os.environ['CREDIT_CARD_STRIPE_API_KEY']
    try:
        # Create a SetupIntent to confirm the PaymentMethod
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ['CREDIT_CARD_COLLECTIONS']]
        if 'set' in data:
            if data['set'] == 'True':
                result = collection.insert_one({'buyer_id': buyer_id, 'registration_status':'card_pending','auction_id':auction_id})
                return {
                    'statusCode': 204,
                    'headers': headers,
                    'body': json.dumps({})
                    }
        if 'status' in data:
            if data['status'] == 'True':
                result = collection.find_one({'buyer_id': buyer_id,'auction_id':auction_id},{'_id':0})
                if result is not None:
                    return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps({'status':result['registration_status']})
                    }
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({"message":"buyer is not registered"})
                    }
        request_body = json.loads(event['body'])
        token = request_body['token']
        payment_method = stripe.PaymentMethod.create(
            type='card',
            card={'token': token}
        )
        setup_intent = stripe.SetupIntent.create(
            payment_method=payment_method.id,
            usage='off_session'  # or 'on_session' as needed
        )
        customer = stripe.Customer.create(
            payment_method=payment_method.id
        )
        # Store the SetupIntent ID along with the buyer's ID
        customer_data = {
            'setup_intent_id': setup_intent.id,
            'customer_id': customer.id
        }
        collection.update_one({'buyer_id':buyer_id},{"$set": {
            'setup_intent_id': setup_intent.id,
            'customer_id': customer.id,
            'registration_status': "Approved",
            "auction_id": auction_id
        }})
        # client.close()
        return{
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'Card verification initiated successfully',
                                'setup_intent_id': setup_intent.id})
        }
    except stripe.error.StripeError as e:
        # Handle specific Stripe errors
        return{
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({'message': 'Card verification failed: ' + str(e)})
        }
    except Exception as e:
        return{
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': 'Error verifying card'})
        }