"""This module is used to list the auctions """
import json
import os
import re
import csv
import boto3
from pymongo import MongoClient
from lib.common_helper import Encoder
from datetime import datetime
import pytz

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
            email_address = event['requestContext']['authorizer']['claims']['email']
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
            print('email', email_address)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        start_date = event['queryStringParameters'].get('start_date', None)
        end_date = event['queryStringParameters'].get('end_date', None)
        status = event['queryStringParameters'].get('status', None)
        # sort = event['queryStringParameters'].get('sort', 'True')
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
        export = int(event['queryStringParameters'].get('export', '0'))
        download_link = None
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
            "show_bidding_history": 1,
            "show_bidder_location_in_bidder_history": 1,
            "publish_auction_results": 1
        }
        if export is not None and export == 1:
            projection_for_export = {
                "_id": 0,  # Exclude the ObjectId field
                "auction_id": 1,
                "title": 1,
                "description": 1,
                "time_zone": 1,
                "start_date": 1,
                "end_date": 1,
                "registration_type": 1,
                "currency": 1,
                "extension_type": 1,
                "extension_time": 1,
                "total_lots": 1,
                "status": 1
            }
        if start_date and end_date:
            date_range_condition = {
                "$or": [
                    {
                        "start_date": {
                            "$gte": int(start_date),
                            "$lte": int(end_date)
                        }
                    },
                    {
                        "end_date": {
                            "$gte": int(start_date),
                            "$lte": int(end_date)
                        }
                    }
                ]
            }

            query_conditions.append(date_range_condition)
        # Check if status is provided and not empty
        if status:
            status_condition = {"status": status}
            query_conditions.append(status_condition)
        # Check if keyword is provided
        if keyword:
            escaped_search_keyword = prepend_backslash(keyword)
            keyword_condition = {"title": {"$regex": escaped_search_keyword,
                                           "$options": "i"}}  # Case-insensitive search
            query_conditions.append(keyword_condition)
        queries = []
        queries.append({"seller_email": email_address})
        queries.append(allowed_status)
        # Create the final query using $and operator
        if query_conditions:
            query_conditions.append({"seller_email": email_address})
            query_conditions.append(allowed_status)
            results = collection.find({"$and": query_conditions}, projection).sort(
                [(key, 1 if order == "ascending" else -1)]).skip((page-1)*limit).limit(limit)
            if export is not None and export == 1:
                download_link = export_as_csv(list(collection.find(
                    {"$and": query_conditions}, projection_for_export).sort([(key, 1 if order == "ascending" else -1)])))
            total_records_count = collection.count_documents(
                {"$and": query_conditions})
        else:
            results = collection.find({"$and": queries}, projection).sort(
                [(key, 1 if order == "ascending" else -1)]).skip((page-1)*limit).limit(limit)
            if export is not None and export == 1:
                download_link = export_as_csv(list(collection.find(
                    {"$and": queries}, projection_for_export).sort([(key, 1 if order == "ascending" else -1)])))
            total_records_count = collection.count_documents(
                {"$and": queries})
        total_auctions = collection.count_documents(
                {"$and": queries})
        paginated_results = list(results)
        # client.close()
        body = {
            "data": paginated_results,
            "total_records_found": total_records_count,
            "total_auctions": total_auctions,
            "current_page": page,
            "total_pages": (total_records_count + limit - 1) // limit
        }
        print(download_link)
        if download_link is not None:
            body["csv_url"] = download_link
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


def export_as_csv(auctions):
    """
    Exports a list of auctions as a CSV file and uploads it to an S3 bucket.

    Args:
        auctions (list): A list of dictionaries representing the auctions.

    Returns:
        str: The signed URL of the uploaded CSV file on S3.

    Raises:
        Exception: If an error occurs during the export and upload process.
    """
    try:
        # Export QR codes as CSV and upload to S3
        csv_file = os.environ["CSV_FILE"]
        s3_key = f"exports/{csv_file}"
        s3_bucket = os.environ['S3_BUCKET']
        time_zones = {
            'GMT': 'GMT',
            'BST': 'Europe/London',
            'IST': 'Asia/Kolkata',
            'CET': 'Europe/Paris',
            'JST': 'Asia/Tokyo',
            'AES': 'Australia/Sydney',
            'NZS': 'Pacific/Auckland',
            'PST': 'America/Los_Angeles',
            'MST': 'America/Denver',
            'CST': 'America/Chicago',
            'EST': 'America/New_York',
            'UTC': 'UTC'
        }
        print(s3_bucket, type(s3_bucket))
        with open(csv_file, "w") as file:
            writer = csv.DictWriter(file, ["Auction ID", "Auction Name", "Auction Description", "Timezone", "Auction Start Date", "Auction Start Time", "Auction End Date", "Auction End Time",
                                    "Registration Type", "Currency", "Extension Type", "Extension mins", "Number of Lots", "Status"])
            writer.writeheader()
            print(333)

            # Format the created_at field as dd-mm-year
            try:
                for auction in auctions:
                    time_zone = ""
                    timezone_str = ""
                    if auction["start_date"] is not None:
                        start_date_epoch = auction["start_date"]/1000
                    else:
                        start_date_epoch=""
                    if auction["end_date"] is not None:
                        end_date_epoch = auction["end_date"]/1000
                    else:
                        end_date_epoch= ""
                    if 'time_zone' in auction:
                        time_zone = auction["time_zone"]
                    if time_zone != "" and time_zone is not None:
                        time_zone_str = time_zone[:3]
                        timezone_str = time_zones[time_zone_str]
                    if start_date_epoch != "":
                        start_date = datetime.utcfromtimestamp(start_date_epoch)
                        timezone = pytz.timezone(time_zones.get(timezone_str, 'UTC'))
                        start_date = timezone.localize(start_date)
                    if end_date_epoch != "":
                        end_date = datetime.utcfromtimestamp(end_date_epoch)
                        timezone = pytz.timezone(time_zones.get(timezone_str, 'UTC'))
                        end_date = timezone.localize(end_date)
                    modified_auction = {}
                    modified_auction["Auction ID"] = auction["auction_id"]
                    modified_auction["Auction Name"] = auction["title"]
                    modified_auction["Auction Description"] = re.sub(re.compile(r'<.*?>'), '', auction["description"])
                    modified_auction["Timezone"] = auction["time_zone"]
                    if start_date_epoch != "":
                        modified_auction["Auction Start Date"] = start_date.date() #if auction["start_date"] is None or datetime.utcfromtimestamp(auction["start_date"]).year == 1970 else datetime.utcfromtimestamp(auction["start_date"]).strftime("%d %B %Y")
                        modified_auction["Auction Start Time"] =  start_date.time()#if auction['start_date'] is None or datetime.utcfromtimestamp(auction["start_date"]).year == 1970 else datetime.utcfromtimestamp(auction["start_date"]).strftime("%H:%M")
                    else:
                        modified_auction["Auction Start Date"]= None
                        modified_auction["Auction Start Time"]= None
                    if end_date_epoch != "":
                        modified_auction["Auction End Date"] = end_date.date() #if auction['end_date'] is None or datetime.utcfromtimestamp(auction["end_date"]).year == 1970 else datetime.utcfromtimestamp(auction["end_date"]).strftime("%d %B %Y")
                        modified_auction["Auction End Time"] = end_date.time()#if auction['end_date'] is None or datetime.utcfromtimestamp(auction["end_date"]).year == 1970 else datetime.utcfromtimestamp(auction["end_date"]).strftime("%H:%M")
                    else:
                        modified_auction["Auction End Date"]= None
                        modified_auction["Auction End Time"]= None
                    modified_auction["Registration Type"] = auction["registration_type"]
                    modified_auction["Currency"] = auction["currency"]
                    modified_auction["Extension Type"] = auction["extension_type"]
                    modified_auction["Extension mins"] = "" if len(auction["extension_time"]) == 0 else auction["extension_time"]+" minutes"
                    modified_auction["Number of Lots"] = auction.get(
                        "total_lots", 0)
                    modified_auction["Status"] = auction["status"]
                    writer.writerow(modified_auction)
            except Exception as err:
                print(err)
                return None
        s3_client = boto3.client("s3", region_name='eu-west-2')
        s3_client.upload_file(csv_file, s3_bucket, s3_key)

        # Generate signed URL
        s3_resource = boto3.resource("s3", region_name='eu-west-2')
        object_acl = s3_resource.ObjectAcl(s3_bucket, s3_key)
        object_acl.put(ACL="public-read")
        s3_signed_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": s3_bucket, "Key": s3_key},
            # URL expiration time in seconds (adjust as needed)
            ExpiresIn=3600,
        )
        return s3_signed_url
    except Exception as err:
        print(err)
        return None