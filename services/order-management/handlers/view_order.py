'''this api will list all the lots'''
import json
import os
import pymongo
from pymongo import MongoClient
from lib.common_helper import Encoder
from bson import ObjectId
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}
def view(event, context):
    """
    The above function is a Python code that retrieves cart details for a specific auction from a
    MongoDB database, based on the user's email address.
    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. It typically includes details such as the HTTP request, headers, and query
    parameters
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other contextual information. In this code snippet, the `context` parameter is not used
    :return: The code is returning a response object with a status code, headers, and a body. The body
    contains a JSON object with a "data" key, which holds the cart details.
    """
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
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ['ORDER_COLLECTION']]
        data = event['queryStringParameters']
        sort_by = data.get('sort_by', 'created_at')  # Default sort by lot number
        sort_order = data.get('sort_order', 'asc')  # Default sort order is ascending
        search_keyword = data.get('search_keyword')
        page = int(event['queryStringParameters'].get(
            'page', '1'))
        limit = int(event['queryStringParameters'].get(
            'per_page', '200'))  # Number of records per page
        auction_id = data['auction_id']
        auction_id= ObjectId(auction_id)
        auction_collection= db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]
        auction= auction_collection.find({'_id':auction_id})
        seller_email= auction['seller_email']
        order_list= collection.find({'email_address':email_address,'seller_email':seller_email})
        if sort_by in ['starting_bid', 'current_bid', 'title1', 'lot_number', 'Top_bidder']:
            sort_criteria = [(sort_by, pymongo.ASCENDING
                              if sort_order == 'asc' else pymongo.DESCENDING)]
        else:
            # Invalid sort_by parameter, use default
            sort_criteria = [('lot_number', pymongo.ASCENDING)]

        # Query the MongoDB collection to find lots matching the seller email and auction ID
        search_criteria = {}
        if search_keyword:
            escaped_search_keyword = prepend backslash(search_keyword)
            print(escaped_search_keyword)
            search_criteria['title1'] = {"$regex": f".*{escaped_search_keyword}.*", "$options": "i"}

        # Combine the search and sort criteria
        query = {"seller_email": seller_email, "auction_id": auction_id, **search_criteria}

        # Query the MongoDB collection to find lots matching the criteria
        lots = list(collection.find(query, {"_id": 0}).
                    sort(sort_criteria).skip((page-1)*limit).limit(limit))
        if order_list is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": " No Lots found"})
            }
        return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps({"data":list(order_list)},cls = Encoder)
            }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
        }