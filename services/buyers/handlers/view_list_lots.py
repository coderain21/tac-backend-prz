'''this api will list all the lots'''
import json
import os
from pymongo import MongoClient
from bson import ObjectId
import re
from lib.common_helper import Encoder


# Constants
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

# Function to escape special characters

# Function to escape special characters
def prepend_backslash(text):
    special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')
    return re.sub(special_chars_pattern, r'\\\1', text)

# Create MongoClient instance globally
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]
buyer_collection = db[os.environ["BUYER_COLLECTION"]]
auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]


# Function to get lots based on search criteria and sorting
def get_lots(auction_id, seller_email, buyer_id, search_keyword, sort_param):
    escaped_search_keyword = prepend_backslash(search_keyword)
    search_criteria = {
        "$or": [
            {"title1": {"$regex": f".*{escaped_search_keyword}.*", "$options": "i"}},
            {"tags": {"$elemMatch": {"$regex": f".*{escaped_search_keyword}.*", "$options": "i"}}}
        ]
    }

    if sort_param == "highest_price":
        sort_field, sort_order = "starting_price", -1
    elif sort_param == "lowest_price":
        sort_field, sort_order = "starting_price", 1
    elif sort_param == "highest_bid":
        sort_field, sort_order = "current_bid", -1
    elif sort_param == "lowest_bid":
        sort_field, sort_order = "current_bid", 1
    else:
        sort_field, sort_order = "lot_number", 1

    aggregation_pipeline = [
        {"$match": {"auction_id": auction_id, 'seller_email': seller_email, **search_criteria}},
        {"$addFields": {"is_wishlisted": False}}  # Default value for is_wishlisted when buyer_id is not provided
    ]

    if buyer_id:
        buyer_details = buyer_collection.find_one({'_id': ObjectId(buyer_id)})
        buyer_email = buyer_details['email_address']

        aggregation_pipeline.extend([
            {"$lookup": {
                "from": os.environ['BUYER_WISHLIST_TABLE_NAME'],
                "localField": "_id",
                "foreignField": "lot_id",
                "as": "wishlist"
            }},
            {"$addFields": {
                "is_wishlisted": {
                    "$in": [buyer_email, "$wishlist.email_address"]
                }
            }},
        ])

    sort_stage = {"$sort": {sort_field: sort_order}}
    aggregation_pipeline.append(sort_stage)

    # Exclude wishlist field from the final output
    projection_stage = {"$project": {"wishlist": 0}}
    aggregation_pipeline.append(projection_stage)

    search_result = lot_collection.aggregate(aggregation_pipeline)

    # Additional print statements
    print("Aggregation pipeline:", aggregation_pipeline)
    result_list = list(search_result)
    return result_list


# Lambda function
def view_list_lots(event, context):
    try:
        data = event.get('queryStringParameters', {})
        auction_id = data.get("auction_id")
        buyer_id = data.get('buyer_id')

        if not auction_id:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }

        _id = ObjectId(auction_id)
        projection = {"_id": 1, "auction_id": 1, "seller_email": 1}
        result = auction_collection.find_one({"_id": _id}, projection)
        seller_email = result['seller_email']
        auction_id = result['auction_id']

        sort_param = data.get("sort_by", "")
        search_keyword = data.get('search', "")
        per_page = int(data.get('per_page', 0))
        page = int(data.get('page', 1))

        lots_list = get_lots(auction_id, seller_email, buyer_id, search_keyword, sort_param)

        total_lots = len(lots_list)
        total_pages = (total_lots + per_page - 1) // per_page if per_page > 0 else 1

        if per_page > 0:
            start_index = (page - 1) * per_page
            end_index = min(start_index + per_page, total_lots)
            lots_list = lots_list[start_index:end_index]

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({'data': lots_list, 'page': page, 'total_pages': total_pages, 'total_records': total_lots}, cls=Encoder)
        }
    except Exception as e:
        print(str(e))
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": str(e)})
        }