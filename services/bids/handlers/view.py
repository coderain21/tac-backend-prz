"""This module is used to view bidder's details"""
import json
import os
from bson import ObjectId
from pymongo import MongoClient
from lib.common_helper import Encoder

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def view_bidder(event, context):
    try:
        # Extract bidder ID from the path parameter
        bidder_id = ObjectId(event['pathParameters']['id'])

        # Retrieve bidder details from the database
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["REGISTER_AUCTION_COLLECTION"]]
        buyer_collection = db[os.environ['BUYER_COLLECTION']]
        projection = {
            'password': 0
        }

        # Retrieve bidder details from the buyer_collection
        bidder_details = collection.find_one({"_id": bidder_id})
        bidder_email = bidder_details['email_address']
        seller_email = bidder_details['seller_email']
        buyer_bidder_details = buyer_collection.find_one({'email_address': bidder_email, 'seller_email': seller_email},projection)

        # Define the order of keys
        key_order = [
            "_id",
            "email_address",
            "first_name",
            "last_name",
            "terms_and_condition",
            "user_type",
            "newsletter_notification",
            "seller_email",
            "address_line1",
            "address_line2",
            "country",
            "postal_code",
            "town/city",  # Assuming "town/city" is a valid key
            "county"
        ]

        # Construct the dictionary with the desired key order
        ordered_dict = {key: buyer_bidder_details[key] if key in buyer_bidder_details else '' for key in key_order}
        ordered_dict['created_at'] = bidder_details['created_at']
        ordered_dict['marketing'] = bidder_details['marketing']
        ordered_dict['buyer_id'] = buyer_bidder_details['_id']
        ordered_dict['phone_number'] = buyer_bidder_details['phone_number']
        ordered_dict['country_code'] = buyer_bidder_details['country_code']

        # Create an "address" object
        ordered_dict['address'] = {
            'address_line1': ordered_dict.pop('address_line1', ''),
            'address_line2': ordered_dict.pop('address_line2', ''),
            'country': ordered_dict.pop('country', ''),
            'postal_code': ordered_dict.pop('postal_code', ''),
            'town/city': ordered_dict.pop('town/city', ''),
            'county': ordered_dict.pop('county', '')
        }

        if buyer_bidder_details:
            client.close()
            # Bidder found, return details
            return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps(ordered_dict, cls=Encoder)
            }
        else:
            # Bidder not found
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Bidder not found"})
            }
    except Exception as err:
        print(err)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "Error while retrieving bidder details"})
        }
