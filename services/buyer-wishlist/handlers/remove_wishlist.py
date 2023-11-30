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

def remove(event, context):
    try:
        try:
            cognito_data = json.loads(event['requestContext']['authorizer']['data'])
            email_address = cognito_data['email']
            if "cognito:groups" in cognito_data and not 'buyer' in cognito_data["cognito:groups"]:
                return {
                    "statusCode": 403,
                    "headers": headers,
                    "body": json.dumps({"message": "You do not have access to perform this API action"})
                }
        except:
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
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        wish_list = db[os.environ['BUYER_WISHLIST_TABLE_NAME']]

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
