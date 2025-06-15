'''The `import os` statement is importing the `os` module in Python'''
import os
import json
import pymongo
import re
import csv
import tempfile
import boto3
from lib.common_helper import Encoder
from urllib.parse import unquote


headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}
client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]


def currency_to_symbol(amount, currency_code):
    currency_symbols = {
        'GBP': '£',
        'USD': '$',
        'EUR': '€',
        'HKD': 'HK$',
        'JPY': '¥',
        'CHF': 'Fr',
        'SGD': 'S$',
        'AUD': 'A$',
        'CAD': 'C$',
        'INR': '₹',
        # Add more currencies as needed
    }

    if currency_code in currency_symbols:
        symbol = currency_symbols[currency_code]
        return f"{symbol}{amount}"
    else:
        return None  # Handle the case where the currency code is not recognized



def currency_to_symbol(amount, currency_code):
    currency_symbols = {
        'GBP': '£',
        'USD': '$',
        'EUR': '€',
        'HKD': 'HK$',
        'JPY': '¥',
        'CHF': 'Fr',
        'SGD': 'S$',
        'AUD': 'A$',
        'CAD': 'C$',
        'INR': '₹',
        # Add more currencies as needed
    }

    if currency_code in currency_symbols:
        symbol = currency_symbols[currency_code]
        return f"{symbol}{amount}"
    else:
        return None  # Handle the case where the currency code is not recognized


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
        # Parse query parameters from the event
        query_parameters = event.get('queryStringParameters')
        print('query_parameters', query_parameters)
        seller_email = query_parameters.get('seller_email')

        auction_id = query_parameters.get('auction_id')
        sort_by = query_parameters.get('sort_by', 'lot_number')  # Default sort by lot number
        sort_order = query_parameters.get('sort_order', 'asc')  # Default sort order is ascending
        search_keyword = query_parameters.get('search_keyword')
        print('search', search_keyword)
        page = int(event['queryStringParameters'].get(
            'page', '1'))
        limit = int(event['queryStringParameters'].get(
            'per_page', '200'))  # Number of records per page

        export = event['queryStringParameters'].get('export', False)
        download_link = None
        collection = db[os.environ["LOT_COLLECTION_NAME"]]
        collection_bidders = db[os.environ["UNIQUE_BIDDERS_COLLECTIONS"]]
        pipeline = [
            {
                "$match": {
                    "auction_id": auction_id,
                    "seller_email": seller_email
                }
            },
            {
                "$group": {
                    "_id": {
                        "auction_id": "$auction_id",
                        "seller_email": "$seller_email",
                        "buyer_id": "$buyer_id"
                    }
                }
            },
            {
                "$group": {
                    "_id": {
                        "auction_id": "$_id.auction_id",
                        "seller_email": "$_id.seller_email"
                    },
                    "uniqueBidders": {"$addToSet": "$_id.buyer_id"}
                }
            }
        ]

        unique_bidders = list(collection_bidders.aggregate(pipeline))

        total_bidders = sum(len(doc["uniqueBidders"]) for doc in unique_bidders)

        # Define the sort criteria based on user input
        if sort_by in ['starting_price', 'current_bid', 'title1', 'lot_number', 'top_bidder', 'paddle_number']:
            sort_criteria = [(sort_by, pymongo.ASCENDING
                              if sort_order == 'asc' else pymongo.DESCENDING)]
        else:
            # Invalid sort_by parameter, use default
            sort_criteria = [('lot_number', pymongo.ASCENDING)]

        # Query the MongoDB collection to find lots matching the seller email and auction ID
        search_criteria = {}
        if search_keyword:
            search_keyword = unquote(query_parameters.get('search_keyword'))
            escaped_search_keyword = prepend_backslash(search_keyword)
            print(escaped_search_keyword)
            search_criteria['$or'] = [
                {"title1": {"$regex": escaped_search_keyword, "$options": "i"}},
                {"top_bidder": {"$regex": escaped_search_keyword, "$options": "i"}},
            ]

        # Combine the search and sort criteria
        query = {"seller_email": seller_email, "auction_id": auction_id, **search_criteria}

        # Query the MongoDB collection to find lots matching the criteria
        lots = list(collection.find(query).
                    sort(sort_criteria).skip((page-1)*limit).limit(limit))
        combined_pipeline = [
            {
                '$match': {
                    'seller_email': seller_email,
                    'auction_id': auction_id
                }
            },
            {
                '$group': {
                    '_id': None,
                    'totalBids': {'$sum': '$current_bid'},
                    'maxBid': {'$max': '$current_bid'},
                    'countBidsGreaterThanZero': {
                        '$sum': {
                            '$cond': [{'$gt': ['$current_bid', 0]}, 1, 0]
                        }
                    }
                }
            }
        ]

        result = list(collection.aggregate(combined_pipeline))
        print('result', result)
        total_bids = 0
        max_bid = 0
        percentage_bids_gt_zero = 0
        if len(result) >0:
            total_bids = result[0]['totalBids']
            max_bid = result[0]['maxBid']
            percentage_bids_gt_zero = result[0]['countBidsGreaterThanZero']
        total_documents = collection.count_documents(query)
        total_lots = collection.count_documents({"seller_email": seller_email, "auction_id": auction_id})
        body = {
            "data": lots,
            "total_records_found": total_documents,
            "total_lots": total_lots,
            "current_page": page,
            "total_pages": (total_documents + limit - 1) // limit,
            "number_of_bids": total_bidders,
            "sum_current_bid": total_bids,
            "total selling":percentage_bids_gt_zero
        }
        if export:
            download_link = export_lots_as_csv(lots, db)
        if download_link is not None:
            body["csv_url"] = download_link
        return {
            'headers': headers,
            "statusCode": 200,
            "body": json.dumps(body,cls= Encoder)
        }
    except Exception as e:
        print(e)
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }


def export_lots_as_csv(lots, db):
    """
    The function exports lots of data as a CSV file using a database connection.
    :param lots: A list of dictionaries representing lots of data
    :param db: The `db` parameter is a database connection object that allows you to interact with a
    database. It can be used to execute SQL queries, fetch data, and perform other database operations
    """
    try:
        auction_id = str(lots[0].get('auction_id', ''))
        filename = auction_id
        auction_collection = db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]
        seller_email = lots[0]["seller_email"]
        auction_status = auction_collection.find_one({
            "seller_email": seller_email,
            "auction_id": auction_id
        }, {"status": 1, "currency": 1})
        print('auction_status', auction_status)
        # Use a temporary directory
        temp_dir = tempfile.mkdtemp()
        csv_file_path = os.path.join(temp_dir, f'{filename}_lots.csv')

        s3_key = f"exports/lots/{auction_id}/{filename}_lots.csv"
        s3_bucket = os.environ['S3_BUCKET']
        print('Lots details------------', lots)

        with open(csv_file_path, "w") as file:
            writer = csv.DictWriter(file, [
                 "Lot Number", "Title", "Starting Bid","Current Bid", "Top Bidder",  "Paddle Number"
            ])
            writer.writeheader()
            for lot in lots:
                lot_images = lot.get("images", [])
                featured_image = next((img["url"] for img in lot_images if img.get("featured")), None)
                thumbnail_url = featured_image or ""


                bid_collection = db[os.environ['BID_INFORMATION_COLLECTION']]
                bids_info_cursor = bid_collection.find({"auction_id": lot["auction_id"], "seller_email": lot["seller_email"], "auction_uuid": auction_status["_id"]})
                bids_info = list(bids_info_cursor)  # Convert cursor to list to get count

                total_current_bid = sum(bid["bid_amount"] for bid in bids_info)
                total_bids = len(bids_info)
                active_bidders = len(set(bid["buyer_id"] for bid in bids_info if bid["bid_status"] == "UnderBidder"))

                # Identify top bid and top bidder based on the winning status
                top_bid = max(bids_info, key=lambda bid: bid.get("bid_amount", 0), default={})
                top_bidder = top_bid.get("buyer_id", "")
                paddle_number = top_bid.get("paddle_number", "")

                # Check if 'total_bids' is not None before converting to int
                total_bids_lot = lot.get('total_bids')
                if total_bids_lot is not None and int(total_bids_lot) > 0:
                    status = 'Selling'
                else:
                    status = 'No Bids'
                # Prepend the S3 URL to the thumbnail URL
                s3_url_prefix = os.environ['CDN_LINK']
                thumbnail_url = s3_url_prefix + thumbnail_url
                print('lot', lot)
                formatted_currency = currency_to_symbol(lot.get("current_bid", ""), auction_status['currency'])
                print('formatted_currency', formatted_currency)
                writer.writerow({
                    "Lot Number": lot.get("lot_number", ""),
                    "Title": lot.get("title1", ""),
                    "Starting Bid": currency_to_symbol(lot.get("starting_price", ""), auction_status['currency']),
                    "Current Bid": currency_to_symbol(lot.get("current_bid", 0), auction_status['currency']) if lot.get("current_bid") else 0,
                    "Top Bidder": lot.get("top_bidder", ""),
                    # "Total Current Bid": lot.get("total_current_bid",""),
                    # "Total Bids": lot.get("total_bids", ""),
                    # "Active Bidders": lot.get("active_bidders", ""),
                    "Paddle Number": lot.get("paddle_number", ""),
                    # "Status(Selling, No Bids)": status,
                    # "Top Bid": top_bid.get("bid_amount", "")  # Assuming this is how the top bid is represented in your data
                })

        # Upload the file to S3
        s3_client = boto3.client("s3", region_name='eu-west-2')
        s3_client.upload_file(csv_file_path, s3_bucket, s3_key)

        # Generate a presigned URL
        s3_signed_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": s3_bucket, "Key": s3_key},
            ExpiresIn=3600,
        )

        # print("CSV file uploaded successfully.")
        # print("Presigned URL:", s3_signed_url)

        return s3_signed_url
    except Exception as err:
        print("Error:", err)
        return None