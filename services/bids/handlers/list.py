"""This module is used to list the bidders """
import json
import os
import re
import csv
import boto3
from bson import ObjectId
from pymongo import MongoClient
from lib.common_helper import Encoder
from datetime import datetime

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def list_bidders(event, context):
    """
    The `list_bidders` function retrieves a list of bidders based on various query parameters, such as
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

        # sort = event['queryStringParameters'].get('sort', 'True')
        key = event['queryStringParameters'].get('key', 'created_at')
        order = event['queryStringParameters'].get('order',
                                                   'descending')  # 'ascending' or 'descending'
        page = int(event['queryStringParameters'].get(
            'page', '1'))  # Default to page 1
        limit = int(event['queryStringParameters'].get(
            'per_page', '10'))  # Number of records per page
        keyword = event['queryStringParameters'].get(
            'keyword', '')  # Search keyword
        auction_id = ObjectId(event['queryStringParameters'].get(
            'auction_id', ''))
        query_conditions = []
        export = int(event['queryStringParameters'].get('export', '0'))
        download_link = None
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["REGISTER_AUCTION_COLLECTION"]]

        projection = {
            "_id": 1,
            "auction_id": 1,
            "name": 1,
            "first_name": 1,
            "last_name": 1,
            "created_at": 1,
            "paddle": 1,
            "marketing": 1,
            "status": 1,
            "email_address": 1
        }
        if export is not None and export == 1:
            projection_for_export = {
                "first_name": 1,
                "created_at": 1,
                "paddle": 1,
                "newsletter_notification": 1,
                "status": 1,
                "email_address": 1
            }


        # Check if keyword is provided
        if keyword:
            keyword_condition = {"name": {"$regex": keyword,
                                           "$options": "i"}}  # Case-insensitive search
            query_conditions.append(keyword_condition)
        queries = []
        queries.append({"auction_id": auction_id})
        queries.append({"seller_email": email_address})
        print(query_conditions)
        # Create the final query using $and operator
        if query_conditions:
            query_conditions.append({"seller_email": email_address})
            query_conditions.append({"auction_id": auction_id})
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
        total_bidders = collection.count_documents(
                {"$and": queries})
        paginated_results = list(results)
        client.close()
        body = {
            "data": paginated_results,
            "total_records_found": total_records_count,
            "total_bidders": total_bidders,
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
            "body": json.dumps({"message": "There was an error an while retrieving the bidders list."})
        }


def export_as_csv(bidders):
    """
    Exports a list of bidders as a CSV file and uploads it to an S3 bucket.

    Args:
        bidders (list): A list of dictionaries representing the bidders.

    Returns:
        str: The signed URL of the uploaded CSV file on S3.

    Raises:
        Exception: If an error occurs during the export and upload process.
    """
    try:

        # Export QR codes as CSV and upload to S3
        csv_file = os.environ["CSV_FILE"]
        s3_key = f"exports/bidders/{csv_file}"
        s3_bucket = os.environ['S3_BUCKET']
        print(s3_bucket, type(s3_bucket))
        with open(csv_file, "w") as file:
            writer = csv.DictWriter(file, ["Auction ID", "Auction Name", "Auction Description", "Timezone", "Auction Start Date", "Auction Start Time", "Auction End Date", "Auction End Time",
                                    "Registration Type", "Currency", "Extension Type", "Extension mins", "Number of Lots", "Status"])
            writer.writeheader()

            # Format the created_at field as dd-mm-year
            for auction in bidders:
                modified_auction = {}
                modified_auction["Auction ID"] = auction["auction_id"]
                modified_auction["Auction Name"] = auction["title"]
                modified_auction["Auction Description"] = re.sub(re.compile(r'<.*?>'), '', auction["description"])
                modified_auction["Auction Start Date"] = "" if auction["start_date"] is None or datetime.fromisoformat(str(auction["start_date"])).year == 1970 else datetime.fromisoformat(str(auction["start_date"])).strftime("%d %B %Y")
                modified_auction["Auction Start Time"] = "" if auction['start_date'] is None or datetime.fromisoformat(str(auction["start_date"])).year == 1970 else datetime.fromisoformat(str(auction["start_date"])).strftime("%H:%M")
                modified_auction["Auction End Date"] = "" if auction['end_date'] is None or datetime.fromisoformat(str(auction["end_date"])).year == 1970 else datetime.fromisoformat(str(auction["end_date"])).strftime("%d %B %Y")
                modified_auction["Auction End Time"] = "" if auction['end_date'] is None or datetime.fromisoformat(str(auction["end_date"])).year == 1970 else datetime.fromisoformat(str(auction["end_date"])).strftime("%H:%M")

                modified_auction["Currency"] = auction["currency"]
                modified_auction["Extension Type"] = auction["extension_type"]
                modified_auction["Extension mins"] = "" if len(auction["extension_time"]) == 0 else auction["extension_time"]+" minutes"
                modified_auction["Number of Lots"] = auction.get(
                    "total_lots", 0)
                modified_auction["Status"] = auction["status"]
                writer.writerow(modified_auction)

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
