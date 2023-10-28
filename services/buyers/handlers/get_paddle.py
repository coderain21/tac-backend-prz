'''this api will generate the paddle number of the buyer'''
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

def paddle_number(event, context):
    """
    The function `paddle_number` is a Python function that takes two parameters, `event` and `context`,
    and does not have any code inside the function body.
    
    :param event: The `event` parameter is an object that contains information about the event that
    triggered the function. This can include details such as the event type, event source, and any data
    associated with the event
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other metadata
    """
    try:
        try:
            print(event)
            cognito_data = json.loads(event['requestContext']['authorizer']['data'])
            print(cognito_data)
            email_address = cognito_data['email']
            if "cognito:groups" in cognito_data and not 'buyer' in cognito_data["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
            # email_address='shrinitpoojary1234@gmail.com'
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
        }
        # Parse query parameters from the event
        data = event['queryStringParameters']
        if data is None or "auction_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }
        auction_id= data['auction_id']
        auction_id= ObjectId(auction_id)
        print(auction_id)
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        buyer = db[os.environ["REGISTER_AUCTION_COLLECTION"]]
        auction=db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        auction_details= auction.find_one({'_id':auction_id})
        print(111,auction_details,email_address)
        paddle=buyer.find_one({"seller_email":auction_details['seller_email'],
                               'email_address':email_address,'auction_id':auction_id})
        print(paddle)
        print(paddle['paddle'])
        result=paddle['paddle']
        client.close()
        if result is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "data not found"})
            }
        return {
            'headers': headers,
            "statusCode": 200,
            "body": json.dumps({'data':result})
        }
    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }