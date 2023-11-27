# """This module is used to view the lots with auction id"""
# import json
# import os
# from pymongo import MongoClient
# from bson import ObjectId
# from lib.common_helper import Encoder
# import re
# headers = {
#     'Content-Type': 'application/json',
#     'Access-Control-Allow-Origin': '*',
#     'Access-Control-Allow-Credentials': True,
#     'Access-Control-Allow-Headers': '*',
#     'Access-Control-Allow-Methods': '*'
# }
# def prepend_backslash(text):
#     # Define a regular expression pattern to match special characters
#     special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')

#     # Use re.sub to replace each match with a backslash followed by the matched character
#     modified_text = re.sub(special_chars_pattern, r'\\\1', text)

#     return modified_text

# def view_list_lots(event, context):
#     """
#     The function `view_list_lots` retrieves a list of lots from a MongoDB database based on the provided
#     auction ID and seller email, and allows sorting the lots by different parameters.

#     :param event: The `event` parameter is a dictionary that contains information about the event that
#     triggered the function. In this case, it is expected to have a key called 'queryStringParameters'
#     which contains the query parameters passed to the function
#     :param context: The `context` parameter is an object that provides information about the runtime
#     environment of the function. It includes details such as the AWS request ID, function name, and
#     other metadata. In this code, the `context` parameter is not used
#     :return: a JSON response with a status code, headers, and a body. The body contains either a list of
#     lots or an error message.
#     """
#     try:
#         data = event['queryStringParameters']
#         if data is None or "auction_id" not in data:
#             return {
#                 "statusCode": 400,
#                 "headers": headers,
#                 "body": json.dumps({"message": "Please provide auction_id"})
#             }
#         client = MongoClient(os.environ['MONGO_CLIENT'])
#         db = client[os.environ['DATABASE']]
#         collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
#         auction_id = data.get("auction_id")
#         if auction_id is not None:
#             _id = ObjectId(auction_id)
#         projection = {
#             "_id": 1,
#             "auction_id": 1,
#             "seller_email": 1
#         }
#         result = collection.find_one({"_id": _id}, projection)
#         client = MongoClient(os.environ['MONGO_CLIENT'])
#         db = client[os.environ['DATABASE']]
#         lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]
#         seller_email = result['seller_email']
#         auction_id = result['auction_id']
#         escaped_search_keyword = ""
#         search_keyword = data.get('search')
#         if search_keyword:
#             escaped_search_keyword = prepend_backslash(search_keyword)
#             print(f"Escaped search keyword: {escaped_search_keyword}")
#             search_criteria = {
#                 "$or": [
#                     {"title1": {"$regex": f".*{escaped_search_keyword}.*", "$options": "i"}},
#                     {"tags": {"$elemMatch": {"$regex": f".*{escaped_search_keyword}.*", "$options": "i"}}}
#                 ]
#             }
#         print(f"Search criteria: {search_criteria}")

#         # Print the find_one result for debugging
#         find_result = lot_collection.find({"auction_id": auction_id, 'seller_email': seller_email, **search_criteria})
#         print("find result:", list(find_result))
#         search_result = lot_collection.aggregate([
#             {"$match": {
#                 "auction_id": auction_id,
#                 'seller_email': seller_email,
#                 "$or": [
#                     {"title1": {"$regex": f'^{escaped_search_keyword}$', "$options": "i"}},
#                     {"tags": {"$regex": f'.*{escaped_search_keyword}.*', "$options": "i"}}
#                 ],
#                 "tags": {"$ne": []}  # Exclude documents where tags is empty
#             }},
#             {"$lookup": {
#                 "from": os.environ['BUYER_WISHLIST_TABLE_NAME'],
#                 "localField": "_id",
#                 "foreignField": "lot_id",
#                 "as": "wishlist"
#             }},
#             {"$addFields": {
#                 "is_wishlisted": {
#                     "$cond": {
#                         "if": {
#                             "$in": ["$_id", "$wishlist.lot_id"]
#                         },
#                         "then": True,
#                         "else": False
#                     }
#                 }
#             }},
#             {"$project": {"wishlist": 0}},  # Remove the wishlist field from the result
#             {"$sort": {"lot_number": 1}}  # 1 for ascending order, -1 for descending order
#         ])
#         print('-------------------------------------------------')
#         print("First aggregation result:", list(search_result))
#         sort_param = data.get("sort_by", "")
#         if sort_param == "highest_price":
#             search_result = lot_collection.aggregate([
#                 {"$match": {"auction_id": auction_id, 'seller_email': seller_email}},
#                 {"$lookup": {
#                     "from": os.environ['BUYER_WISHLIST_TABLE_NAME'],
#                     "localField": "_id",
#                     "foreignField": "lot_id",
#                     "as": "wishlist"
#                 }},
#                 {"$addFields": {
#                     "is_wishlisted": {
#                         "$cond": {
#                             "if": {
#                                 "$in": ["$_id", "$wishlist.lot_id"]
#                             },
#                             "then": True,
#                             "else": False
#                         }
#                     }
#                 }},
#                 {"$project": {"wishlist": 0}},  # Remove the wishlist field from the result
#                 {"$sort": {"starting_price": -1}}  # Sort by starting_price in descending order
#             ])
#         elif sort_param == "lowest_price":
#             search_result = lot_collection.aggregate([
#                 {"$match": {"auction_id": auction_id, 'seller_email': seller_email}},
#                 {"$lookup": {
#                     "from": os.environ['BUYER_WISHLIST_TABLE_NAME'],
#                     "localField": "_id",
#                     "foreignField": "lot_id",
#                     "as": "wishlist"
#                 }},
#                 {"$addFields": {
#                     "is_wishlisted": {
#                         "$cond": {
#                             "if": {
#                                 "$in": ["$_id", "$wishlist.lot_id"]
#                             },
#                             "then": True,
#                             "else": False
#                         }
#                     }
#                 }},
#                 {"$project": {"wishlist": 0}},  # Remove the wishlist field from the result
#                 {"$sort": {"starting_price": 1}}  # Sort by starting_price in ascending order
#             ])
#         elif sort_param == "highest_bid":
#             search_result = lot_collection.aggregate([
#                 {"$match": {"auction_id": auction_id, 'seller_email': seller_email}},
#                 {"$lookup": {
#                     "from": os.environ['BUYER_WISHLIST_TABLE_NAME'],
#                     "localField": "_id",
#                     "foreignField": "lot_id",
#                     "as": "wishlist"
#                 }},
#                 {"$addFields": {
#                     "is_wishlisted": {
#                         "$cond": {
#                             "if": {
#                                 "$in": ["$_id", "$wishlist.lot_id"]
#                             },
#                             "then": True,
#                             "else": False
#                         }
#                     }
#                 }},
#                 {"$project": {"wishlist": 0}},  # Remove the wishlist field from the result
#                 {"$sort": {"current_bid": -1}}  # Sort by current_bid in descending order
#             ])
#         elif sort_param == "lowest_bid":
#             search_result = lot_collection.aggregate([
#                 {"$match": {"auction_id": auction_id, 'seller_email': seller_email}},
#                 {"$lookup": {
#                     "from": os.environ['BUYER_WISHLIST_TABLE_NAME'],
#                     "localField": "_id",
#                     "foreignField": "lot_id",
#                     "as": "wishlist"
#                 }},
#                 {"$addFields": {
#                     "is_wishlisted": {
#                         "$cond": {
#                             "if": {
#                                 "$in": ["$_id", "$wishlist.lot_id"]
#                             },
#                             "then": True,
#                             "else": False
#                         }
#                     }
#                 }},
#                 {"$project": {"wishlist": 0}},  # Remove the wishlist field from the result
#                 {"$sort": {"current_bid": 1}}  # Sort by current_bid in ascending order
#             ])
#         else:
#             search_result = lot_collection.aggregate([
#                 {"$match": {"auction_id": auction_id, 'seller_email': seller_email}},
#                 {"$lookup": {
#                     "from": os.environ['BUYER_WISHLIST_TABLE_NAME'],
#                     "localField": "_id",
#                     "foreignField": "lot_id",
#                     "as": "wishlist"
#                 }},
#                 {"$addFields": {
#                     "is_wishlisted": {
#                         "$cond": {
#                             "if": {
#                                 "$in": ["$_id", "$wishlist.lot_id"]
#                             },
#                             "then": True,
#                             "else": False
#                         }
#                     }
#                 }},
#                 {"$project": {"wishlist": 0}},  # Remove the wishlist field from the result
#                 {"$sort": {"lot_number": 1}}  # Sort by lot_number in ascending order
#             ])
#         lots_list = list(search_result)
#         print('lot list---------------------\n', lots_list)
#         return {
#             "statusCode": 200,
#             "headers": headers,
#             "body": json.dumps({'data': lots_list}, cls=Encoder)
#         }

#     except Exception as e:
#         print(str(e))
#         return {
#             "statusCode": 500,
#             "headers": headers,
#             "body": json.dumps({"message": str(e)})
#         }








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
        {"$project": {"wishlist": 0}},
        {"$sort": {"lot_number": 1}}  # Default sorting by lot_number
    ]

    if sort_param:
        sort_field = sort_param.rstrip('_asc').rstrip('_desc')
        sort_order = -1 if sort_param.endswith("_desc") else 1
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