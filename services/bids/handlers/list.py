"""This module is used to list the bidders """
import json
import os
import csv
import boto3
from bson import ObjectId
from pymongo import MongoClient
from lib.common_helper import Encoder
import tempfile

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
        export = event['queryStringParameters'].get('export', False)
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
        if export:
            projection_for_export = {
                "first_name": 1,
                "last_name": 1,
                "name": 1,
                "auction_id": 1,
                "created_at": 1,
                "paddle": 1,
                "newsletter_notification": 1,
                "status": 1,
                "email_address": 1,
                "marketing": 1
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
            if export:
                download_link = export_as_csv(list(collection.find(
                    {"$and": query_conditions}, projection_for_export).sort([(key, 1 if order == "ascending" else -1)])), db)
            total_records_count = collection.count_documents(
                {"$and": query_conditions})
        else:
            results = collection.find({"$and": queries}, projection).sort(
                [(key, 1 if order == "ascending" else -1)]).skip((page-1)*limit).limit(limit)
            if export:
                download_link = export_as_csv(
                    list(collection.find({"$and": queries}, projection_for_export).sort([(key, 1 if order == "ascending" else -1)])),db)
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


def export_as_csv(bidders, db):
    try:
        auction_id = str(bidders[0].get('auction_id', ''))
        auction_collection = db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]
        auction_details = auction_collection.find_one({'_id': ObjectId(auction_id)})
        filename = auction_details['auction_id']
        
        # Use a temporary directory
        temp_dir = tempfile.mkdtemp()
        csv_file_path = os.path.join(temp_dir, f'{filename}.csv')

        s3_key = f"exports/bidders/{auction_id}/{filename}.csv"
        s3_bucket = os.environ['S3_BUCKET']
        print('Bidders details------------', bidders)
        
        with open(csv_file_path, "w") as file:
            writer = csv.DictWriter(file, [
                "Paddle Number", "Name", "Email", "Date Registered", "Marketing Communication", "Bidder Status"
            ])
            writer.writeheader()

            for bidder in bidders:
                writer.writerow({
                    "Name": f"{bidder.get('first_name', '')} {bidder.get('last_name', '')}".strip(),
                    "Email": bidder["email_address"],
                    "Bidder Status": bidder["status"],
                    "Paddle Number": bidder.get("paddle", ""),
                    "Date Registered": str(bidder.get("created_at", "")),
                    "Marketing Communication": "subscribed" if bidder.get("marketing", False) else "unsubscribed"
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