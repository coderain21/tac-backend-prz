'''this api will list all the orders'''
import json
import os
import re
import pymongo
from pymongo import MongoClient
from lib.common_helper import Encoder
import math

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

#database
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
user_collection = db[os.environ['SELLERS_TABLE']]


def prepend_backslash(text):
    """
    Prepend backslash to special characters in the given text.

    Args:
        text (str): The input text to modify.

    Returns:
        str: The modified text with backslashes before special characters.
    """
    # Define a regular expression pattern to match special characters
    special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')

    # Use re.sub to replace each match with a backslash followed by the matched character
    modified_text = re.sub(special_chars_pattern, r'\\\1', text)

    return modified_text

def list_all_sellers(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        # Initialize the query
        query = {}

        # Extract parameters from the request
        data = event.get('queryStringParameters', {})
        print('data', data)

        # Extract individual parameters with default values
        sort_by = data.get('sort_by', 'full_name')
        sort_order = data.get('sort_order', 'ascending')
        page = int(data.get('page', '1'))
        limit = int(data.get('per_page', '10'))

        # Initialize sort_criteria with a default value
        sort_criteria = []

        if sort_by and sort_by in ['full_name', 'status']:
            sort_criteria = [
                (sort_by, pymongo.ASCENDING if sort_order == 'ascending' else pymongo.DESCENDING),
                ('_id', pymongo.ASCENDING)  # Secondary sort for stability
            ]


        print('sort_criteria', sort_criteria)

        # Initialize search query
        search_query = {}

        if 'search' in data:
            search_text = prepend_backslash(data['search'])
            search_query["$or"] = [
                {"email_address": {"$regex": search_text, "$options": "i"}},
                {"full_name": {"$regex": search_text, "$options": "i"}}
            ]
        print('search_query', search_query)
        # Merge search query with the existing query
        query.update(search_query)
        # if start_date and end_date:
        #     date_range_condition = {
        #         "created_at": {
        #             "$gte": int(start_date),
        #             "$lte": int(end_date)
        #         }
        #     }

        #     query.update(date_range_condition)
        print('query', query)

        # Query the MongoDB collection
        seller_list = user_collection.find(
            query,
            {
                "email_address": 1,
                "status": 1,
                "full_name": 1,
                "kyb_status": 1,
                "kyc_status": 1,
                "brand_name": 1,
                "city": 1,
                "country": 1
            }
        ).sort(sort_criteria).skip((page - 1) * limit).limit(limit)
        print('seller_list', seller_list)

        total_records = user_collection.count_documents(query)
        print('total_records', total_records)

        # Check if orders_list is None or empty
        if not seller_list:
            print('No seller found matching the criteria')

        # Calculate total records and pages
        # total_records = user_collection.count_documents(query)
        total_pages = math.ceil(total_records / limit)
        print('total_pages', total_pages)

        if seller_list is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "No Sellers found"})
            }

        body = {
            "data": list(seller_list),
            "total_pages": total_pages,
            "total_records": total_records,
            "current_page": page
        }

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(body, cls=Encoder)
        }
    except Exception as err:
        print('Error',str(err))
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "Internal server Error"})
        }