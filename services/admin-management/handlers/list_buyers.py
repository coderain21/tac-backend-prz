"""This module is used to list the auctions """
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
def prepend_backslash(text):
    # Define a regular expression pattern to match special characters
    special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')

    # Use re.sub to replace each match with a backslash followed by the matched character
    modified_text = re.sub(special_chars_pattern, r'\\\1', text)

    return modified_text

import json
import os
from pymongo import MongoClient

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def list_buyers(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        buyer_collection = db[os.environ["BUYER_COLLECTION"]]
        user_collection = db[os.environ["SELLERS_TABLE"]]
        result

        # Default sorting by name
        sort_key = 'first_name'
        # Check if sorting key is provided
        if 'queryStringParameters' in event and 'sort_by' in event['queryStringParameters']:
            sort_key = event['queryStringParameters']['sort_by']

        # Sorting order (default: ascending)
        sort_order = 1
        if 'queryStringParameters' in event and 'sort_order' in event['queryStringParameters']:
            sort_order = 1 if event['queryStringParameters']['sort_order'].lower() == 'ascending' else -1

        # Search options
        search_query = {}
        if 'queryStringParameters' in event and 'search' in event['queryStringParameters']:
            search_text = event['queryStringParameters']['search']
            search_query['$or'] = [
                {"buyer_id": {"$regex": search_text, "$options": "i"}},
                {"first_name": {"$regex": search_text, "$options": "i"}},
                {"last_name": {"$regex": search_text, "$options": "i"}},
                {"email_address": {"$regex": search_text, "$options": "i"}}
            ]

        # Pagination options
        page_size = 10
        page_number = 1
        if 'queryStringParameters' in event:
            if 'page_number' in event['queryStringParameters']:
                page_number = int(event['queryStringParameters']['page_number'])

        # Total buyers count
        total_buyers = buyer_collection.count_documents(search_query)

        # Fetching buyers with sorting, pagination, and search options
        buyers = buyer_collection.find(search_query).sort(sort_key, sort_order).skip((page_number - 1) * page_size).limit(page_size)

        response_body = {
            "buyers": list(buyers),
            "total_buyers": total_buyers,
            "page_size": page_size,
            "page_number": page_number
        }

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(response_body)
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)})
        }
