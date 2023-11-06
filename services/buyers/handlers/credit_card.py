'''this function validates the '''
import json
import stripe
from pymongo import MongoClient
import os


# Initialize MongoDB connection
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db['dev-credit_card']
def credit_card(event, context):
    # # Parse the request body to get the token
    request_body = json.loads(event['body'])
    # token = request_body['token']
    stripe.api_key = os.environ['STRIPE_API_KEY']
    print(11)
    token=stripe.Token.create(
    card=request_body,
    )
    print(44,token)
    try:
        # Create a customer
        print(22)
        customer = stripe.Customer.create(source=token)
        print(33,customer)

        # Create a $1 charge for verification
        charge = stripe.Charge.create(
            amount=100,  # $1 in cents
            currency='usd',
            customer=customer.id,
            description='Card verification charge'
        )
        print(1001, charge)
        # Refund the $1 charge
        # stripe.Refund.create(charge=charge.id)
        # print(8888)

        # If the card is valid, store the customer data in MongoDB
        customer_data = {
            'customer_id': customer.id,
            'email': customer.email,
            'card_last4': token.card.last4,
            'created_at': customer.created
        }
        print(22022,customer_data)
        collection.insert_one(customer_data)

        response = {
            'statusCode': 200,
            'body': json.dumps({'message': 'Card verified successfully and data stored'})
        }
    except Exception as e:
        print(e)
        response = {
            'statusCode': 500,
            'body': json.dumps({'message': 'Error verifying card'})
        }

    return response
