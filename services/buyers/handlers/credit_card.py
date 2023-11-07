# '''this function validates the credit card '''
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
    # # Parse the request body to get the token
    request_body = json.loads(event['body'])
    token = request_body['token']
    stripe.api_key = 'sk_test_51Nb00kSFIyzeA4NAfngqSbNEuIJh7fjMnkvL7nxtAgbxc3Vncw7ZJde6BlMTAGVxDwJNL6j2h0b9MlUCsSxNybpx00HZ4PqRNu'
    # stripe.api_key = 'sk_test_tR3PYbcVNZZ796tH88S4VQ2u'
    data = event['queryStringParameters']
    buyer_id= data.get('buyer_id')
    buyer_id= ObjectId(buyer_id)
    try:
        # Create a customer
        print(22)
        customer = stripe.Customer.create(source=token)
        
        customer['name']='Shrinit'
        customer['address']='teyscberfa'
        print(33,customer)
        payment_intent = stripe.PaymentIntent.create(
            amount=100,  # Replace with the actual amount
            currency='usd',
            customer=customer.id,# Replace with the customer ID
            description='Card verification charge'
        )
        print(11111, payment_intent)
        customer_data = {
            'customer':customer,
            'buyer_id': buyer_id
        }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db['dev-credit_card']
        print(22022,customer_data)
        collection.insert_one(customer_data)
        client.close()
        response = {
            'statusCode': 200,
            "headers": headers,
            'body': json.dumps({'message': 'Card verified successfully and data stored',
                                'payment_intent_id':payment_intent})
        }
    except Exception as e:
        print(e)
        response = {
            'statusCode': 500,
            "headers": headers,
            'body': json.dumps({'message': 'Error verifying card'})
        }

    return response
