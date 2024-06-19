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

client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]


def prepend_backslash(text):
    # Define a regular expression pattern to match special characters
    special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')

    # Use re.sub to replace each match with a backslash followed by the matched character
    modified_text = re.sub(special_chars_pattern, r'\\\1', text)

    return modified_text

def list_auction(event, context):
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
        print(event,123)
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
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
        start_date = event['queryStringParameters'].get('start_date', None)
        end_date = event['queryStringParameters'].get('end_date', None)
        status = event['queryStringParameters'].get('status', None)
        key = event['queryStringParameters'].get('key', 'created_at')
        order = event['queryStringParameters'].get('order',
                                                   'descending')  # 'ascending' or 'descending'
        page = int(event['queryStringParameters'].get(
            'page', '1'))  # Default to page 1
        limit = int(event['queryStringParameters'].get(
            'per_page', '3'))  # Number of records per page
        keyword = event['queryStringParameters'].get(
            'keyword', '')  # Search keyword
        query_conditions = []
        total_records_count=0
        print(34566)
        # client = MongoClient(
        #               os.environ['MONGO_CLIENT'],
        #               maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
        #                 )
        # db = client[os.environ['DATABASE']]
        # collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        allowed_status = {
        "status": {"$in": ["Draft", "Published", "Completed","Accepting bids", "Cancelled"]}
        }
        projection = {
            "_id": 1,
            "auction_id": 1,
            "title": 1,
            "start_date": 1,
            "end_date": 1,
            "status": 1,
            "auction_image": 1,
            "note": 1,
            "created_at": 1,
            "currency": 1,
            "description": 1,
            "time_zone": 1,
            "extension_type": 1,
            "extension_time": 1,
            "extension_time_between_lots": 1,
            "registration_type": 1,
            "add_buyer_fees": 1,
            "fees": 1,
            "make_your_auction_private": 1,
            "passcode": 1,
            "menu_links": 1,
            "footer.background_color": 1,
            "footer.text_color": 1,
            "buttons.background_color": 1,
            "buttons.text_color": 1,
            "content_area.background_color": 1,
            "content_area.text_color": 1,
            "header.background_color": 1,
            "header.text_color": 1,
            "font.hearder_font": 1,
            "font.body_font": 1,
            "logo_image": 1,
            "percentage": 1,
            "template_name": 1,
            "logo_redirection_url": 1,
            "faq": 1,
            "terms_and_condition": 1,
            "paddle": 1,
            "show_bidder_location_in_bidder_history": 1,
            "publish_auction_results": 1,
            "total_lots":1,
            "seller_email": 1,
            "seller_name": 1
        }
        if start_date and end_date:
            start_date=int(start_date)
            end_date= int(end_date)
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
            print(date_range_condition)
            query_conditions.append(date_range_condition)
        print(2)
        # Check if status is provided and not empty
        if status:
            status_condition = {"status": status}
            query_conditions.append(status_condition)
        print(3)
        # Check if keyword is provided
        if keyword:
            if keyword.isnumeric():
                int_key=int(keyword)
                total_lots={"total_lots": int_key}
            else:
                total_lots={"total_lots": keyword}
            escaped_search_keyword = prepend_backslash(keyword)
            keyword_condition={"$or": [
                {"title": {"$regex": escaped_search_keyword, "$options": "i"}},
                total_lots,
                {"seller_name": {"$regex": escaped_search_keyword, "$options": "i"}},
                {"status": {"$regex": escaped_search_keyword, "$options": "i"}}]} # Case-insensitive search
            query_conditions.append(keyword_condition)
        queries = []
        queries.append(allowed_status)
        print(4)
        # Create the final query using $and operator
        if query_conditions:
            query_conditions.append(allowed_status)
            results = collection.find({"$and": query_conditions}, projection).sort(
                [(key, 1 if order == "ascending" else -1)]).skip((page-1)*limit).limit(limit)
            print(5)
            total_records_count = collection.count_documents(
                {"$and": query_conditions})
        else:
            print(7)
            results = collection.find({"$and": queries}, projection).sort(
                [(key, 1 if order == "ascending" else -1)]).skip((page-1)*limit).limit(limit)
            total_records_count = collection.count_documents(
                {"$and": queries})
        total_auctions = collection.count_documents(
                {"$and": queries})
        print(8)
        paginated_results = list(results)
        # client.close()
        body = {
            "data": paginated_results,
            "total_records_found": total_records_count,
            "total_auctions": total_auctions,
            "current_page": page,
            "total_pages": (total_records_count + limit - 1) // limit
        }
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(body, cls=Encoder)
        }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
        }