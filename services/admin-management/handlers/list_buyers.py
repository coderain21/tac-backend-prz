"""This module is used to list the buyers """
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


def list_buyers(event, context):
    """
    The `list_buyers` function retrieves a list of buyers from a MongoDB database, with options for
    sorting, pagination, and search.
    :param event: The `event` parameter is the input event data that triggers the function. It contains
    information about the HTTP request that was made to invoke the function
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other contextual information. In this code, the `context` parameter is not used, but it is included
    as a standard parameter in AWS
    :return: a response object with a status code, headers, and a body. The body contains a JSON string
    that includes a list of buyers, the total number of buyers, the page size, and the page number.
    """
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
        print(1)
        result= user_collection.find_one({"user_type":"admin","email_address":email_address})
        if result is None:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        # Default sorting by name
        sort_key = 'full_name'
        # Check if sorting key is provided
        projection={
            "email_address": 1,
            "_id":1,
            "created_at":1,
            "full_name": 1
        }
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
            search_text = prepend_backslash(search_text)
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
        buyers = buyer_collection.find(search_query,projection).sort(sort_key, sort_order).skip((page_number - 1) * page_size).limit(page_size)
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
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)})
        }
