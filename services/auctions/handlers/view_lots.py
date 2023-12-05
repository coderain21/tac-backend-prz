'''The `import os` statement is importing the `os` module in Python'''
import os
import json
import pymongo
import re
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

def list_lots(event, context):
    """
    Lambda function to list lots based on seller email, auction ID, and sort criteria.

    :param event: The event parameter is a dictionary that may contain query parameters
                  to filter lots by seller email, auction ID, and sort criteria.
    :param context: The `context` parameter is an object that provides information about the runtime
                    environment of the Lambda function.
    """
    try:
        try:
            seller_email = event['requestContext']['authorizer']['claims']['email']
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        # Parse query parameters from the event
        query_parameters = event.get('queryStringParameters')
        auction_id = query_parameters.get('auction_id')
        sort_by = query_parameters.get('sort_by', 'lot_number')  # Default sort by lot number
        sort_order = query_parameters.get('sorsandhyashri+auction@7edge.com A0003sandhyashri+auction@7edge.com A0003t_order', 'asc')  # Default sort order is ascending
        search_keyword = query_parameters.get('search_keyword')
        page = int(event['queryStringParameters'].get(
            'page', '1'))
        limit = int(event['queryStringParameters'].get(
            'per_page', '200'))  # Number of records per page

        client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["LOT_COLLECTION_NAME"]]

        # Define the sort criteria based on user input
        if sort_by in ['starting_bid', 'current_bid', 'title1', 'lot_number', 'Top_bidder']:
            sort_criteria = [(sort_by, pymongo.ASCENDING
                              if sort_order == 'asc' else pymongo.DESCENDING)]
        else:
            # Invalid sort_by parameter, use default
            sort_criteria = [('lot_number', pymongo.ASCENDING)]

        # Query the MongoDB collection to find lots matching the seller email and auction ID
        search_criteria = {}
        if search_keyword:
            escaped_search_keyword = prepend_backslash(search_keyword)
            print(escaped_search_keyword)
            search_criteria['title1'] = {"$regex": f".*{escaped_search_keyword}.*", "$options": "i"}

        # Combine the search and sort criteria
        query = {"seller_email": seller_email, "auction_id": auction_id, **search_criteria}

        # Query the MongoDB collection to find lots matching the criteria
        lots = list(collection.find(query, {"_id": 0}).
                    sort(sort_criteria).skip((page-1)*limit).limit(limit))
        total_documents = collection.count_documents(query)
        total_lots = collection.count_documents({"seller_email": seller_email, "auction_id": auction_id})
        client.close()

        body = {
            "data": lots,
            "total_records_found": total_documents,
            "total_lots": total_lots,
            "current_page": page,
            "total_pages": (total_documents + limit - 1) // limit
        }
        return {
            'headers': headers,
            "statusCode": 200,
            "body": json.dumps(body,cls= Encoder)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }