'''this api will list all the buyers'''
import json
import os
import re
from pymongo import MongoClient
from lib.common_helper import Encoder

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]

def prepend_backslash(text):
    # Define a regular expression pattern to match special characters
    special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')

    # Use re.sub to replace each match with a backslash followed by the matched character
    modified_text = re.sub(special_chars_pattern, r'\\\1', text)

    return modified_text

def list_bidders(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        buyer_collection = db[os.environ["REGISTER_AUCTION_COLLECTION"]]
        # Default sorting by name
        sort_key = 'created_at'
        # Check if sorting key is provided
        projection = {
            "email_address": 1,
            "created_at": 1,
            "name": 1,
            "marketing": 1
        }
        if 'queryStringParameters' in event and 'sort_by' in event['queryStringParameters']:
            sort_key = event['queryStringParameters']['sort_by']

        # Sorting order (default: ascending)
        sort_order = 1
        if 'queryStringParameters' in event and 'sort_order' in event['queryStringParameters']:
            sort_order = 1 if event['queryStringParameters']['sort_order'].lower() == 'ascending' else -1

        # Search options
        search_query = {'seller_email': email_address}
        if 'queryStringParameters' in event and 'search' in event['queryStringParameters']:
            search_text = event['queryStringParameters']['search']
            search_text = prepend_backslash(search_text)
            search_query['$or'] = [
                {"name": {"$regex": search_text, "$options": "i"}},
                {"email_address": {"$regex": search_text, "$options": "i"},
                }
            ]

        # Pagination options
        page_size = 10
        page_number = 1
        if 'queryStringParameters' in event:
            if 'page_number' in event['queryStringParameters']:
                page_number = int(event['queryStringParameters']['page_number'])

        # Total buyers count
        total_buyers = buyer_collection.count_documents(search_query)

        # Fetching unique buyers based on email address with sorting, pagination, and search options
        pipeline = [
            {"$match": search_query},
            {"$group": {"_id": "$email_address", "firstRecord": {"$first": "$$ROOT"}}},
            {"$replaceRoot": {"newRoot": "$firstRecord"}},
            {"$sort": {sort_key: sort_order}},
            {"$skip": (page_number - 1) * page_size },
            {"$limit": page_size},
            {"$project": projection},
        ]

        buyers = buyer_collection.aggregate(pipeline)
        print('buyerss', buyers)
        total_buyers_pipeline = [
            {"$match": search_query},
            {"$group": {"_id": "$email_address"}},
            {"$count": "total_buyers"}
        ]

        total_buyers_result = list(buyer_collection.aggregate(total_buyers_pipeline))
        total_buyers = total_buyers_result[0]["total_buyers"] if total_buyers_result else 0
        response_body = {
            "buyers": list(buyers),
            "total_buyers": total_buyers,
            "page_size": page_size,
            "page_number": page_number
        }

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(response_body, cls=Encoder)
        }

    except Exception as e:
        print('ee', e)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)})
        }
