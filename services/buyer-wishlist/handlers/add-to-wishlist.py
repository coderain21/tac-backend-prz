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


def create(event, context):
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
        body = json.loads(event['body'])
        data = event['queryStringParameters']
        lot = data['lot_id']
        lot_id= ObjectId(lot)
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]
        buyer_collection = db[os.environ['BUYER_COLLECTION']]
        wish_list= db[os.environ['BUYER_WISHLIST_TABLE_NAME']]
        lot_detail = lot_collection.find_one({'_id':lot_id})
        buyer= buyer_collection.find_one({'email_address':email_address})
        if 'fav_lots' in buyer:
            fav = buyer['fav_lot']
            if lot not in fav:
                fav.append(lot)
                buyer_collection.update_one({'email_address':email_address},{'$set':{'fav_lots':fav}})
            else:
                return {
                    "statusCode": 400,
                    "headers": headers,
                    "body": json.dumps({"message": "Lot has already exists"})
                }
            
        else:
            fav = []
            fav.append(lot)
            buyer_collection.update_one({'email_address':email_address},{'$set':{'fav_lots':fav}})
        seller_email= lot_detail['seller_email']
        auction_name = body['auction_name']
        insert_data= {
            'seller_email': seller_email,
            'lot_id':lot,
            'email_address': email_address,
            'auction_name': auction_name,
            'auction_id': lot_detail['auction_id']
        }
        wish_list.insert_one(insert_data)
        client.close()
        return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps({"message": "Lot added to wishlist successfully"})
            }
    except Exception as e:
        print(str(e))
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }