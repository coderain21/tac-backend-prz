# from pymongo import MongoClient

# def has_images_for_auction_and_seller(auction_id, seller_email):
#     # Assuming you have a MongoDB connection
#     client = MongoClient('mongodb://develop:develop!7edge@indy-auction.cimvoiv4bc2g.eu-west-2.docdb.amazonaws.com:27017/indyauction-develop?authMechanism=DEFAULT&authSource=indyauction-develop&retryWrites=false')
#     db = client["indyauction-develop"]
#     collection = db["dev-lots"]

#     # Query to find lots for the given auction_id and seller_email
#     query = {
#         "auction_id": auction_id,
#         "seller_email": seller_email,
#         "images": {"$not": {"$size": 0}}
#     }

#     # Projection to only retrieve the 'images' field
#     projection = {
#         "_id": 0,
#         "images": 1
#     }

#     # Fetch the document(s) matching the query
#     result = collection.find_one(query, projection)
#     print(result)
#     return result is not None  # True if at least one lot has non-empty images array

# # Example usage
# auction_id = "A0078"
# seller_email = "sthuthi+testing@7edge.com"
# result = has_images_for_auction_and_seller(auction_id, seller_email)

# if result:
#     print("All lots have images.")
# else:
#     print("At least one lot has an empty array of images.")
from pymongo import MongoClient

def has_images_for_auction_and_seller(auction_id, seller_email):
    # Assuming you have a MongoDB connection
    client = MongoClient('mongodb://develop:develop!7edge@indy-auction.cimvoiv4bc2g.eu-west-2.docdb.amazonaws.com:27017/indyauction-develop?authMechanism=DEFAULT&authSource=indyauction-develop&retryWrites=false')
    db = client["indyauction-develop"]
    collection = db["dev-lots"]

    # Aggregation pipeline to check for non-empty images array
    pipeline = [
        {
            "$match": {
                "auction_id": auction_id,
                "seller_email": seller_email
            }
        },
        {
            "$redact": {
                "$cond": {
                    "if": {"$eq": [{"$size": "$images"}, 0]},
                    "then": "$$PRUNE",
                    "else": "$$KEEP"
                }
            }
        },
        {
            "$limit": 1
        }
    ]

    # Execute the aggregation pipeline
    result = list(collection.aggregate(pipeline))

    return bool(result)  # True if at least one lot has non-empty images array

# Example usage
auction_id = "A0078"
seller_email = "sthuthi+testing@7edge.com"
# auction_id = "A0050"
# seller_email = "aishwarya+30@7edge.com"
result = has_images_for_auction_and_seller(auction_id, seller_email)

if result:
    print("All lots have images.")
else:
    print("At least one lot has an empty array of images.")
