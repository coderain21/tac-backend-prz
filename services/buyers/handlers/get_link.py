"""This module is used to view the auction with auction id"""
import json
import os
from pymongo import MongoClient
from lib.common_helper import Encoder

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
seller_collection = db[os.environ["SELLERS_TABLE"]]


def get_link(event, context):
    try:
        data = event['queryStringParameters']
        print('data', data)
        if data is None or "seller_email" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide Seller email"})
            }
        projection = {
            "facebook_link": 1,
            "Instagram_link": 1,
            "twitter": 1,
            "tiktok_link": 1,
            "linkdin_link": 1
        }
        seller_links = seller_collection.find_one({"email_address": data["seller_email"]}, projection)

        if not seller_links:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Seller not found"})
            }
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(seller_links, cls=Encoder)
        }
    except Exception as e:
        print('error', e)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "Internal server error"})
        }