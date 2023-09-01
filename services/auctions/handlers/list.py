"""The code is importing necessary modules for the Python script."""
import json
import os
from pymongo import MongoClient
from lib.common_helper import Encoder
from datetime import datetime, timedelta

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def list_auction(event, context):
    """
    The `list_auction` function retrieves a list of auctions based on various query parameters, such as
    start date, end date, status, sort order, page number, and keyword.
    
    :param event: The `event` parameter is a dictionary that contains the input data for the function.
    It typically includes information about the HTTP request, such as query parameters, headers, and the
    request body. In this case, the function expects the query parameters to include `start_date`,
    `end_date`, `status
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes properties such as the AWS request ID, the function name,
    the function version, and more. This parameter is not used in the provided code snippet
    :return: a JSON response with the following properties:
    - "statusCode": The HTTP status code of the response (200 for success, 403 for access denied, 500
    for error)
    - "body": A JSON string containing the response data, including the message, results,
    total_records_found, current_page, and total_pages.
    """
    try:
        try:
            email_address = 'sandhyashri@7edge.com'
            print('email', email_address)
            
        except:
            return {
                "statusCode": 403,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        

        start_date = event['queryStringParameters'].get('start_date', None)
        end_date = event['queryStringParameters'].get('end_date', None)
        status = event['queryStringParameters'].get('status', None)
        sort = event['queryStringParameters'].get('sort', 'True')
        key = event['queryStringParameters'].get('key', 'created_at')
        order = event['queryStringParameters'].get('order', 'ascending')# 'ascending' or 'descending'
        page = int(event['queryStringParameters'].get('page', '1'))  # Default to page 1
        per_page = 3  # Number of records per page
        keyword = event['queryStringParameters'].get('keyword', '')  # Search keyword
        query_conditions = []

        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        skip_records = (page - 1) * per_page

        projection = {
            "_id": 0,  # Exclude the ObjectId field
            "auction_id": 1,
            "title": 1,
            "start_date": 1,
            "end_date": 1,
            "status": 1,
            "auction_image ": 1,
            "notes": 1,
            "created_at": 1
        }

        # Check if both start_date and end_date are provided
        if start_date and end_date:
            start_date = datetime.strptime(start_date, "%Y-%m-%d")
            end_date = datetime.strptime(end_date, "%Y-%m-%d")
            end_date += timedelta(days=1)
            date_range_condition = {
                "$or": [
                    {
                        "start_date": {
                            "$gte": start_date,
                            "$lte": end_date
                        }
                    },
                    {
                        "end_date": {
                            "$gte": start_date,
                            "$lte": end_date
                        }
                    }
                ]
            }

            query_conditions.append(date_range_condition)

        # Check if status is provided and not empty
        if status:
            status_condition = {"status": status}
            query_conditions.append(status_condition)
            print(query_conditions)

        # Check if keyword is provided
        if keyword:
            keyword_condition = {"title": {"$regex": keyword, "$options": "i"}}  # Case-insensitive search
            query_conditions.append(keyword_condition)

        # Create the final query using $and operator
        if query_conditions:
            query_conditions.append({"seller_email": email_address})
            results = collection.find({"$and": query_conditions}, projection)
            total_records_count = collection.count_documents({"$and": query_conditions})
        else:
            # If no conditions are provided, return all documents sorted by 'creation_date' in ascending order
            results = collection.find({"seller_email": email_address}, projection)
            total_records_count = collection.count_documents({"seller_email": email_address})
            print('3333333333', total_records_count)

        # Handle sorting based on 'sort', 'key', and 'order' variables
        results_list = list(results)  # Convert the cursor to a list

        if sort and sort.lower() == 'true':
            if key:
                if order and order.lower() == 'descending':
                    results_list = sorted(results_list, key=lambda x: x[key], reverse=True)
                else:
                    results_list = sorted(results_list, key=lambda x: x[key])

        # Manually implement pagination after sorting
        start_index = (page - 1) * per_page
        end_index = start_index + per_page
        paginated_results = results_list[start_index:end_index]

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Query successful",
                "results": paginated_results,
                "total_records_found": total_records_count,
                "current_page": page,
                "total_pages": (total_records_count + per_page - 1) // per_page  # Calculate total pages
            }, cls=Encoder)
        }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
        }
