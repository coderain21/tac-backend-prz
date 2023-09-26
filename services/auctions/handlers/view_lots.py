'''The `import os` statement is importing the `os` module in Python'''
import os
import json
import pymongo

# Initialize the MongoDB client
client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db[os.environ["LOT_COLLECTION_NAME"]]

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

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
        sort_order = query_parameters.get('sort_order', 'asc')  # Default sort order is ascending
        search_keyword = query_parameters.get('search_keyword')
        page = int(event['queryStringParameters'].get(
            'page', '1'))
        limit = int(event['queryStringParameters'].get(
            'per_page', '200'))  # Number of records per page

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
            search_criteria['title1'] = {"$regex": f".*{search_keyword}.*", "$options": "i"}

        # Combine the search and sort criteria
        query = {"seller_email": seller_email, "auction_id": auction_id, **search_criteria}

        # Query the MongoDB collection to find lots matching the criteria
        lots = list(collection.find(query, {"_id": 0}).
                    sort(sort_criteria).skip((page-1)*limit).limit(limit))
        total_documents = collection.count_documents(query)

        body = {
            "data": lots,
            "total_records_found": total_documents,
            "current_page": page,
            "total_pages": (total_documents + limit - 1) // limit
        }
        return {
            'headers': headers,
            "statusCode": 200,
            "body": json.dumps(body)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }