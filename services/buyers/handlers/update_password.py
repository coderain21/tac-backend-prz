# '''this function validates the '''
import json
import stripe
from pymongo import MongoClient
import os

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

# # Initialize MongoDB connection
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db['dev-credit_card']
def credit_card(event, context):
    # # Parse the request body to get the token
    request_body = json.loads(event['body'])
    token = request_body['token']
    stripe.api_key = 'sk_test_51Nb00kSFIyzeA4NAfngqSbNEuIJh7fjMnkvL7nxtAgbxc3Vncw7ZJde6BlMTAGVxDwJNL6j2h0b9MlUCsSxNybpx00HZ4PqRNu'
    # stripe.api_key = 'sk_test_tR3PYbcVNZZ796tH88S4VQ2u'
    try:
        # Create a customer
        print(22)
        customer = stripe.Customer.create(source=token)
        print(33,customer)
        payment_intent = stripe.PaymentIntent.create(
            amount=100,  # Replace with the actual amount
            currency='usd',
            customer=customer.id,  # Replace with the customer ID
            metadata={
                'name': 'shrinit',
                'address': 'Nerul'
            }
        )
        print(11111, payment_intent)
        customer_data = {
            'customer_id': customer.id,
            'email': customer.email,
            # 'card_last4': token.card.last4,
            'created_at': customer.created
        }
        print(22022,customer_data)
        collection.insert_one(customer_data)

        response = {
            'statusCode': 200,
            "headers": headers,
            'body': json.dumps({'message': 'Card verified successfully and data stored'})
        }
    except Exception as e:
        print(e)
        response = {
            'statusCode': 500,
            "headers": headers,
            'body': json.dumps({'message': 'Error verifying card'})
        }

    return response