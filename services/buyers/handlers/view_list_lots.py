import json
import os
from pymongo import MongoClient
from bson import ObjectId
from lib.common_helper import Encoder
import re

# Constants
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

# Function to escape special characters
def prepend_backslash(text):
    special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')
    return re.sub(special_chars_pattern, r'\\\1', text)

# Function to get lots based on search criteria and sorting
def get_lots(auction_id, seller_email, search_keyword, sort_param):
    client = MongoClient(os.environ['MONGO_CLIENT'])
    db = client[os.environ['DATABASE']]
    lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]

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
        {"$lookup": {
            "from": os.environ['BUYER_WISHLIST_TABLE_NAME'],
            "localField": "_id",
            "foreignField": "lot_id",
            "as": "wishlist"
        }},
        {"$addFields": {
            "is_wishlisted": {
                "$cond": {
                    "if": {"$gt": [{"$size": "$wishlist"}, 0]},
                    "then": True,
                    "else": False
                }
            }
        }},
        {"$project": {"wishlist": 0}}# Default sorting by lot_number
    ]

    sort_stage = {"$sort": {sort_field: sort_order}}
    aggregation_pipeline.append(sort_stage)

    search_result = lot_collection.aggregate(aggregation_pipeline)

    # Additional print statement
    print("Aggregation pipeline:", aggregation_pipeline)
    result_list = list(search_result)
    print('-------------------------------------------------')
    print("Aggregation result:", result_list)
    print('kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', result_list)
    return result_list


# Lambda function
def view_list_lots(event, context):
    try:
        data = event.get('queryStringParameters', {})
        auction_id = data.get("auction_id")

        if not auction_id:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }

        with MongoClient(os.environ['MONGO_CLIENT']) as client:
            db = client[os.environ['DATABASE']]
            collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
            lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]

            _id = ObjectId(auction_id)
            projection = {"_id": 1, "auction_id": 1, "seller_email": 1}
            result = collection.find_one({"_id": _id}, projection)
            seller_email = result['seller_email']
            auction_id = result['auction_id']

            sort_param = data.get("sort_by", "")
            search_keyword = data.get('search', "")

            lots_list = get_lots(auction_id, result['seller_email'], search_keyword, sort_param)
            print('============', lots_list)

            return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps({'data': lots_list}, cls=Encoder)
            }

    except Exception as e:
        print(str(e))
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": str(e)})
        }