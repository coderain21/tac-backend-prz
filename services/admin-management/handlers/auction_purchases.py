'''this api will list all the orders'''
import json
import os
import re
from bson import ObjectId
import pymongo
from pymongo import MongoClient
from lib.common_helper import Encoder
import math
import csv
import boto3
from datetime import datetime

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

#database
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
orders_collection = db[os.environ['ORDERS_COLLECTION']]
buyer_collection = db[os.environ['BUYER_COLLECTION']]
user_collection = db[os.environ['SELLERS_TABLE']]
auction_collection = db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]

def prepend_backslash(text):
    """
    Prepend backslash to special characters in the given text.

    Args:
        text (str): The input text to modify.

    Returns:
        str: The modified text with backslashes before special characters.
    """
    # Define a regular expression pattern to match special characters
    special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')

    # Use re.sub to replace each match with a backslash followed by the matched character
    modified_text = re.sub(special_chars_pattern, r'\\\1', text)

    return modified_text

def list_purchases(event, context):
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        # Initialize the query
        query = {"auction_id": event['queryStringParameters'].get('auction_id', '')}
        export = event['queryStringParameters'].get('export', False)
        download_link = None


        # Fetch auction details
        auction_id = query["auction_id"]
        auction_details = auction_collection.find_one({"_id": ObjectId(auction_id)})

        if auction_details is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Auction doesn't exist"})
            }

        # Extract parameters from the request
        data = event.get('queryStringParameters', {})

        # Extract individual parameters with default values
        sort_by = data.get('sort_by', 'created_at')
        sort_order = data.get('sort_order', 'descending')
        page = int(data.get('page', '1'))
        limit = int(data.get('per_page', '10'))

        # Initialize sort_criteria with a default value
        sort_criteria = []

        if sort_by and sort_by in ['created_at', 'payment_status', 'order_number', 'name', 'payment_status', 'auction_title', 'payment', 'amount']:
            sort_criteria = [(sort_by, pymongo.ASCENDING if sort_order == 'ascending' else pymongo.DESCENDING)]

        # Initialize search query
        search_query = {}

        if 'search' in data:
            search_text = prepend_backslash(data['search'])
            search_query["$or"] = [
                {"order_number": {"$regex": search_text, "$options": "i"}},
                {"name": {"$regex": search_text, "$options": "i"}}
            ]

        # Merge search query with the existing query
        query.update(search_query)

        # Query the MongoDB collection
        orders_list = orders_collection.find(
            query,
            {
                "_id": 1,
                "name": 1,
                "amount": 1,
                "created_at": 1,
                "order_number": 1,
                "currency": 1,
                "payment_status": 1,
                "payment": 1,
                'auction_title': 1
            }
        ).sort(sort_criteria).skip((page - 1) * limit).limit(limit)
        # Calculate total records and pages
        total_records = orders_collection.count_documents(query)
        total_pages = math.ceil(total_records / limit)

        if orders_list is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "No Orders found"})
            }
        body = {
            "data": list(orders_list),
            "total_pages": total_pages,
            "total_records": total_records,
            "current_page": page
        }
        if export:
            orders = orders_collection.find(
                query,
                {
                    "_id": 1,
                    "name": 1,
                    "amount": 1,
                    "created_at": 1,
                    "order_number": 1,
                    "currency": 1,
                    "payment_status": 1,
                    "payment": 1,
                    'auction_title': 1,
                    'shipping_address': 1,
                }
            )
            download_link = export_as_csv(list(orders))
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
            "body": json.dumps({"message": "There was an error"})
        }












def export_as_csv(sales):
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
        print('sales', sales)
        # Export QR codes as CSV and upload to S3
        csv_file = os.environ["SALES_CSV_FILE"]
        s3_key = f"exports/{csv_file}"
        s3_bucket = os.environ['S3_BUCKET']
        print(s3_bucket, type(s3_bucket))
        with open(csv_file, "w") as file:
            writer = csv.DictWriter(file, ["Order no.", "Customer name", "Date","Result", "Payment type", "Payment status"])
            writer.writeheader()
            print(333)
            # Format the created_at field as dd-mm-year
            for sale in sales:
                modified_sales = {}
                date = datetime.fromtimestamp(sale['created_at'])
                # Format the date as a string with only the date
                formatted_date = date.strftime('%Y-%m-%d')
                # Format the date as a string with only the date
                shipping_address = sale['shipping_address']
                full_name = f"{shipping_address['first_name']} {shipping_address['last_name']}"
                modified_sales["Order no."] = sale["order_number"]
                modified_sales["Customer name"] = sale['name']
                modified_sales["Date"] = formatted_date
                modified_sales['Result'] = sale['amount']
                modified_sales["Payment status"] = sale["payment_status"]
                modified_sales["Payment type"]= sale["payment"]
                writer.writerow(modified_sales)
        s3_client = boto3.client("s3", region_name='eu-west-2')
        s3_client.upload_file(csv_file, s3_bucket, s3_key)
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
