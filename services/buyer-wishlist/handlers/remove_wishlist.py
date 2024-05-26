"""
Module: add_to_wishlist

This module provides functionality to add lots to a buyer's wishlist.
"""
import json
import os
from pymongo import MongoClient
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
wish_list = db[os.environ['BUYER_WISHLIST_TABLE_NAME']]


def remove(event, context):
    try:
        # try:
        #     cognito_data = json.loads(
        #         event['requestContext']['authorizer']['data'])
        #     email_address = cognito_data['email']
        #     if "cognito:groups" not in cognito_data :
        #         return {
        #             "statusCode": 403,
        #             "headers": headers,
        #             "body": json.dumps({"message": "You do not have access to perform this API action"})
        #         }
        # except:
        #     return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
            print('email', email_address)
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'buyer' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                print('here in first')
                return {
                    "statusCode": 403,
                    "headers": headers,
                    "body": json.dumps({"message": "You do not have access to perform this API action"})
                }
        except:
            print('here in second')
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        data = event['queryStringParameters']
        lot_id = data.get('lot_id')

        if not lot_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Please provide a valid lot_id'})
            }

        lot_id = ObjectId(lot_id)
        # client = MongoClient(os.environ['MONGO_CLIENT'])
        # db = client[os.environ['DATABASE']]
        # wish_list = db[os.environ['BUYER_WISHLIST_TABLE_NAME']]

        # Check if the lot exists in the wishlist
        existing_wishlist_entry = wish_list.find_one({
            'lot_id': lot_id,
            'email_address': email_address
        })

        if not existing_wishlist_entry:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'message': 'Lot not found in wishlist'})
            }

        # Remove the lot from the wishlist
        wish_list.delete_one({'lot_id': lot_id, 'email_address': email_address})

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'Lot removed from wishlist'})
        }
    except Exception as e:
        print(str(e))
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': 'Internal server error'})
        }
