'''The `import os` statement is importing the `os` module in Python'''
import datetime
import os
import json
import pymongo
import re
import csv
import pytz
import tempfile
import boto3
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


client = pymongo.MongoClient(os.environ['MONGO_CLIENT'], maxIdleTimeMS=60000)
db = client[os.environ['DATABASE']]
collection = db[os.environ["LOT_COLLECTION_NAME"]]
collection_bidders = db[os.environ["UNIQUE_BIDDERS_COLLECTIONS"]]
user_collection = db[os.environ['SELLERS_TABLE']]



def list_bids(event, context):
    """
    Lambda function to list lots based on seller email, auction ID, and sort criteria.

    :param event: The event parameter is a dictionary that may contain query parameters
                  to filter lots by seller email, auction ID, and sort criteria.
    :param context: The `context` parameter is an object that provides information about the runtime
                    environment of the Lambda function.
    """
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
            print('email', email_address)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        # buyer_email_address= 'anusha.k+newacc1@7edge.com'
        # result= user_collection.find_one({"user_type":"admin","email_address":email_address})
        # if result is None:
        #     return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }

        # Parse query parameters from the event
        query_parameters = event.get('queryStringParameters')
        seller_email= query_parameters.get('seller_email')
        auction_id = query_parameters.get('auction_id')
        sort_by = query_parameters.get('sort_by', 'lot_number')  # Default sort by lot number
        sort_order = query_parameters.get('sort_order', 'asc')  # Default sort order is ascending
        search_keyword = query_parameters.get('search_keyword')
        page = int(event['queryStringParameters'].get(
            'page', '1'))
        limit = int(event['queryStringParameters'].get(
            'per_page', '200'))  # Number of records per page

        export = event['queryStringParameters'].get('export', False)
        download_link = None
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

        print("Total bidders:", total_bidders)


        # Define the sort criteria based on user input
        if sort_by in ['name', 'bid_status', 'lot_title', 'lot_number', 'bid_amount', 'paddle_number', 'updated_at']:
            # Define a mapping of bid_status values to numerical values
            # bid_status_mapping = {"UnderBidder": 0, "Winning": 1, "Won": 2}

            if sort_by == 'updated_at':
                sort_by = 'time_stamp'

            # Check if the sort_by parameter is bid_status
            # if sort_by == 'bid_status':
            #     # Use a lambda function to map the bid_status values to their corresponding numerical values
            #     sort_criteria = [(sort_by, pymongo.ASCENDING if sort_order == 'asc' else pymongo.DESCENDING,
            #                     lambda x: bid_status_mapping.get(x[sort_by], float('inf')))]
            # else:
            #     # For other sort_by parameters, use the default sorting criteria
            #     sort_criteria = [(sort_by, pymongo.ASCENDING if sort_order == 'asc' else pymongo.DESCENDING)]

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
            search_criteria['$or'] = [
                {"lot_title": {"$regex": escaped_search_keyword, "$options": "i"}},
                {"name": {"$regex": escaped_search_keyword, "$options": "i"}},
            ]

        # Combine the search and sort criteria
        query = {"seller_email": seller_email, "auction_id": auction_id, **search_criteria}

        # Query the MongoDB collection to find lots matching the criteria
        lots = list(collection.find(query).sort(sort_criteria).skip((page-1)*limit).limit(limit))
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
                    'totalBids': {'$sum': '$bid_amount'},
                    'maxBid': {'$max': '$bid_amount'},
                    'countBidsGreaterThanZero': {
                        '$sum': {
                            '$cond': [{'$gt': ['$bid_amount', 0]}, 1, 0]
                        }
                    }
                }
            }
        ]

        result = list(collection.aggregate(combined_pipeline))
        total_bids = 0
        max_bid = 0
        percentage_bids_gt_zero = 0
        if len(result) > 0:
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
            "total selling": percentage_bids_gt_zero
        }
        if export:
            export_lots = list(collection.find(query).sort(sort_criteria))
            download_link = export_lots_as_csv(export_lots)
        if download_link is not None:
            body["csv_url"] = download_link
        # client.close()
        return {
            'headers': headers,
            "statusCode": 200,
            "body": json.dumps(body, cls=Encoder)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }


currencySymbolMapping = {
    "GBP": '£',
    "USD": '$',
    "EUR": '€',
    "HKD": 'HK$',
    "JPY": '¥',
    "CHF": 'Fr',
    "SGD": 'S$',
    "AUD": 'A$',
    "CAD": 'C$',
    "INR": '₹',
}



# def format_date(timestamp, time_zone):
#     date = datetime.datetime.fromtimestamp(timestamp, time_zone)
#     print('date', date)
#     options = {
#         'day': 'numeric',
#         'month': 'short',
#         'year': 'numeric',
#         'hour': 'numeric',
#         'minute': '2-digit',
#         'timezone': time_zone,
#     }

#     formatted = date.strftime('%d %b %Y, %H:%M %Z')
#     print('formatted', formatted)
#     if '+05:30' in formatted:
#         formatted = formatted.replace('+05:30', 'IST')
#     elif '+11' in formatted:
#         formatted = formatted.replace('+11', 'AESR')
#     elif '+13' in formatted:
#         formatted = formatted.replace('+13', 'NZST')
#     elif '+01' in formatted:
#         formatted = formatted.replace('+01', 'CET')
#     elif '+09' in formatted:
#         formatted = formatted.replace('+09', 'JST')
#     elif '+08' in formatted:
#         formatted = formatted.replace('+08', 'CST')

#     return formatted.replace(',', ' /')


def format_date(timestamp, time_zone):
    print('Received timestamp:', timestamp)
    print('Received time zone:', time_zone)

    # Define the timezone mapping
    timeZoneMap = {
        'UTC - Coordinated Universal Time': 'Etc/UTC',
        'GMT - Greenwich Mean Time': 'Etc/GMT',
        'BST - British Summer Time': 'Europe/London',
        'CET - Central European Time': 'Europe/Paris',
        'IST - India Standard Time': 'Asia/Kolkata',
        'CST - China Standard Time': 'Asia/Shanghai',
        'JST - Japan Standard Time': 'Asia/Tokyo',
        'AEST - Australian Eastern Standard Time': 'Australia/Sydney',
        'NZST - New Zealand Standard Time': 'Pacific/Auckland',
        'PST - Pacific Standard Time(US)': 'America/Los_Angeles',
        'MST - Mountain Standard Time (US)': 'America/Denver',
        'MDT - Mountain Daylight Time (US)': 'America/Denver',
        'CST - Central Standard Time (US)': 'America/Chicago',
        'EST - Eastern Standard Time (US)': 'America/New_York',
    }

    timezone_identifier = timeZoneMap.get(time_zone, 'Etc/UTC')  # Default to 'Etc/UTC' if timezone not found
    print('Timezone identifier:', timezone_identifier)

    try:
        # Convert milliseconds to seconds
        timestamp_seconds = timestamp / 1000.0

        # Convert the epoch timestamp to a UTC datetime object
        utc_datetime = datetime.datetime.utcfromtimestamp(timestamp_seconds)

        # Convert UTC datetime to local timezone
        local_timezone = pytz.timezone(timezone_identifier)
        localized_datetime = utc_datetime.replace(tzinfo=pytz.utc).astimezone(local_timezone)

        # Format the datetime object
        formatted_date = localized_datetime.strftime('%d %b %Y / %H:%M %Z')
        print('Formatted date:', formatted_date)

        # Return the formatted date string
        return formatted_date

    except Exception as e:
        print("Error:", e)
        return None





def export_lots_as_csv(lots):
    """
    The function exports lots of data as a CSV file using a database connection.
    :param lots: A list of dictionaries representing lots of data
    :param db: The `db` parameter is a database connection object that allows you to interact with a
    database. It can be used to execute SQL queries, fetch data, and perform other database operations
    """
    try:
        auction_id = str(lots[0].get('auction_id', ''))
        filename = 'Bid Insights'
        # auction_collection = db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]
        # seller_email = lots[0]["email_address"]
        # auction_status = auction_collection.find_one({
        #     "seller_email": seller_email,
        #     "auction_id": auction_id
        # }, {"status": 1})
        # Use a temporary directory
        temp_dir = tempfile.mkdtemp()
        csv_file_path = os.path.join(temp_dir, f'{filename}.csv')

        s3_key = f"exports/lots/{auction_id}/{filename}.csv"
        s3_bucket = os.environ['S3_BUCKET']
        print('Lots details------------', lots)

        with open(csv_file_path, "w") as file:
            writer = csv.DictWriter(file, [
                 "Lot Number","Thumbnail Image", "Title", "Paddle Number", "Bidder Name", "Status", "Bid", "Latest Bid"])
            writer.writeheader()
            for lot in lots:
                lot_image = lot.get("lot_image", "")
                currency = lot.get("currency", "")
                if currency in currencySymbolMapping:
                    currency = currencySymbolMapping.get(currency, "")
                    # print('currency', currency)
                timezone = lot.get("time_zone", "")
                # print('timezone', timezone)
                # Extract the standard timezone identifier from the timezone string
                # Extract the standard timezone identifier from the timezone string
                timezone_identifier = lot.get("time_zone").split(' ')[0]

                # Pass the extracted timezone identifier to the format_date() function
                latest_bid = format_date(lot.get("time_stamp"), timezone)


                # Prepend the S3 URL to the thumbnail URL
                s3_url_prefix = os.environ['CDN_LINK']
                thumbnail_url = s3_url_prefix + lot_image

                writer.writerow({
                    "Lot Number": lot.get("lot_number", ""),
                    "Thumbnail Image": thumbnail_url,
                    "Title": lot.get("lot_title", ""),
                    "Paddle Number": lot.get("paddle_number", ""),
                    "Bidder Name": lot.get("name", ""),
                    "Status": lot.get("bid_status", ""),
                    "Bid": currency+str(lot.get("bid_amount", "")),
                    "Latest Bid": latest_bid,
                })

        # Upload the file to S3
        s3_client = boto3.client("s3", region_name='eu-west-2')
        s3_client.upload_file(csv_file_path, s3_bucket, s3_key)

        # Ensure that the file is made public
        s3_resource = boto3.resource("s3", region_name='eu-west-2')
        object_acl = s3_resource.ObjectAcl(s3_bucket, s3_key)
        object_acl.put(ACL="public-read")

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
