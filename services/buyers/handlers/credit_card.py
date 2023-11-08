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

def credit_card(event, context):
    # Parse the request body to get the token and buyer_id
    data = event['queryStringParameters']
    print(data)
    buyer_id= data['buyer_id']
    # Set your Stripe API key
    stripe.api_key = os.environ['CREDIT_CARD_STRIPE_API_KEY']

    try:
        # Create a SetupIntent to confirm the PaymentMethod
        client = MongoClient(os.environ['MONGO_CLIENT'])
        print(1)
        db = client[os.environ['DATABASE']]
        print(2)
        collection = db['dev-credit_card']
        print(data)
        if 'set' in data:
            print(3)
            if data['set'] == 'True':
                print(4)
                result = collection.insert_one({'buyer_id': buyer_id, 'registration_status':'Pending'})
                print(result)
                return {
                    'statusCode': 204,
                    'headers': headers,
                    'body': json.dumps({})
                    }
        if 'status' in data:
            if data['status'] == 'True':
                result = collection.find_one({'buyer_id': buyer_id})
                if result is not None:
                    response = {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps({'result':result})
                    }
        request_body = json.loads(event['body'])
        token = request_body['token']
        payment_method = stripe.PaymentMethod.create(
            type='card',
            card={'token': token}
        )
        print(111111111111,payment_method)
        setup_intent = stripe.SetupIntent.create(
            payment_method=payment_method.id,
            usage='off_session'  # or 'on_session' as needed
        )
        print(2222222, setup_intent)
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
            'registration_status': "Approved"
        }})
        client.close()

        response = {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'Card verification initiated successfully',
                                'setup_intent_id': setup_intent.id})
        }
    except stripe.error.StripeError as e:
        # Handle specific Stripe errors
        response = {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({'message': 'Card verification failed: ' + str(e)})
        }
    except Exception as e:
        response = {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': 'Error verifying card'})
        }

    return response
