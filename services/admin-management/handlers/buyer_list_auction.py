"""This module is used to list the auctions """
import json
import os
import re
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
def prepend_backslash(text):
    # Define a regular expression pattern to match special characters
    special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')

    # Use re.sub to replace each match with a backslash followed by the matched character
    modified_text = re.sub(special_chars_pattern, r'\\\1', text)

    return modified_text

def buyer_list_auction(event, context):
    """
    The `list_auction` function retrieves a list of auctions based on specified filters and pagination
    parameters.
    :param event: The `event` parameter is a dictionary that contains the input data for the function.
    It includes the query string parameters that are passed to the function. These parameters are used
    to filter and paginate the auction list
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes properties such as the AWS request ID, the function name,
    the function version, and more. This parameter is not used in the code you provided, but it is
    commonly included in AWS Lambda functions
    :return: a dictionary with the following keys:
    - "statusCode": an integer representing the HTTP status code
    - "headers": a dictionary representing the HTTP headers
    - "body": a JSON string representing the response body
    """
    try:
        print(event)
        try:
            seller_email = event['requestContext']['authorizer']['claims']['cognito:username']
        #     if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
        #         return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }
        #     print('email', email_address)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        dev_auction_register = db[os.environ["REGISTER_AUCTION_COLLECTION"]]
        buyer_collection = db[os.environ["BUYER_COLLECTION"]]
        user_collection = db[os.environ["SELLERS_TABLE"]]
        auction_collection = os.environ['AUCTION_MONGODB_COLLECTION_NAME']
        print(1,dev_auction_register)
        result= user_collection.find_one({"user_type":"admin","email_address":seller_email})
        if result is None:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        query_parameters = event.get('queryStringParameters')
        page_number = query_parameters.get('page_number','1')
        page_number= int(page_number)
        buyer_id=query_parameters.get('buyer_id')
        email_address= buyer_collection.find_one({"_id":ObjectId(buyer_id)},{"email_address":1,"_id":0})
        print('buyer_email', email_address)
        page_size = 10
        # Calculate the number of documents to skip
        if 'queryStringParameters' in event and 'sort_by' in event['queryStringParameters']:
            sort_key = event['queryStringParameters']['sort_by']
        else:
            sort_key= "created_at"
        sort_order = -1
        if 'queryStringParameters' in event and 'sort_order' in event['queryStringParameters']:
            sort_order = 1 if event['queryStringParameters']['sort_order'].lower() == 'ascending' else -1
        skip = (page_number - 1) * page_size
        print(1)
        pipeline = [
            {"$match": {"email_address": email_address["email_address"]}},
            {"$lookup": {
                "from": auction_collection,
                "localField": "auction_id",
                "foreignField": "_id",
                "as": "auction"
            }},
            {"$unwind": "$auction"},
            {"$project": {
                "seller_name": "$auction.seller_name",
                "auction_id": "$auction.auction_id",
                "status": "$auction.status",
                "title": "$auction.title",
                "email_address":1,
                "seller_email":1,
                "buyer_status": "$status",
                "created_at": 1
            }},
            {"$sort": {sort_key: sort_order}},
            {"$skip": skip},
            {"$limit": page_size}
        ]
        result = dev_auction_register.aggregate(pipeline)
        result_list = list(result)  # Convert the cursor to a list
        total_count = len(result_list)  # Get the length of the list

        print('result', result_list)
        print(email_address)
        print('total_count', total_count)

        if total_count == 0:
            return {
                "headers": headers,
                "statusCode": 404,
                "body": json.dumps({"message":  "Not Found"})
            }

        print('data', result_list)

        print(34566)
        return {
            "headers": headers,
            "statusCode": 200,
            "body": json.dumps({"data":result_list,"page_number":page_number,"page_size":page_size,"total_records": total_count},cls=Encoder)
        }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
        }