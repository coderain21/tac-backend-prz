'''this api will validate the credit card'''
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
    buyer_id= data['buyer_id']
    buyer_id= ObjectId(buyer_id)
    # Set your Stripe API key
    stripe.api_key = 'sk_test_51Nb00kSFIyzeA4NAfngqSbNEuIJh7fjMnkvL7nxtAgbxc3Vncw7ZJde6BlMTAGVxDwJNL6j2h0b9MlUCsSxNybpx00HZ4PqRNu'

    try:
        # Create a SetupIntent to confirm the PaymentMethod
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db['dev-credit_card']
        buyer_collection = db[os.environ['BUYER_COLLECTION']]
        buyer= buyer_collection.find_one({'_id':buyer_id})
        if buyer is None:
            return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'message':"buyer not found"})
                    }
        if 'set' in data:
            if data['set'] == 'True':
                result = collection.insert_one({'buyer_id': buyer_id, 'registration_status':'Card Pending'})
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps({'result':result})
                    }
        request_body = json.loads(event['body'])
        token = request_body['token']

        if 'status' in data:
            if data['status'] == 'True':
                result = collection.find_one({'buyer_id': buyer_id})
                if result is not None:
                    return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps({'result':result})
                    }
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

        return{
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'Card verification initiated successfully',
                                'setup_intent_id': setup_intent.id})
        }
    except stripe.error.StripeError as e:
        # Handle specific Stripe errors
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({'message': 'Card verification failed: ' + str(e)})
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': 'Error verifying card'})
        }
