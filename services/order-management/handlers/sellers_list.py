'''this api will list all the orders'''
import json
import os
import re
import pymongo
from pymongo import MongoClient
from lib.common_helper import Encoder
import math
from lib.get import fetch_seller_data_from_auction
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

def list_orders(event, context):
    """
    List orders based on various parameters.

    Args:
        event (dict): The event data passed to the function, typically from an API Gateway.
        context: The runtime information.

    Returns:
        dict: A dictionary containing the response with order information.
    """
    try:
        try:
            seller_email = event['requestContext']['authorizer']['claims']['email']
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
            print('email', seller_email)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        orders_collection = db[os.environ['ORDERS_COLLECTION']]

        data = event['queryStringParameters']
        sort_by = data.get('sort_by', 'created_at')
        sort_order = data.get('sort_order', 'desc')
        # Extracting start and end dates from query parameters
        start_date_str = data.get('start_date')
        end_date_str = data.get('end_date')
        # Convert timestamp strings to integers
        export = int(event['queryStringParameters'].get('export', '0'))
        download_link = None
        start_timestamp = int(start_date_str) if start_date_str else None
        end_timestamp = int(end_date_str) if end_date_str else None
        search_keyword = data.get('search_keyword')
        page = int(event['queryStringParameters'].get(
            'page', '1'))
        limit = int(event['queryStringParameters'].get(
            'per_page', '20'))  # Number of records per page
        payment_type = data.get("payment_type")
        payment_status = data.get("payment_status")

        auction_id = data['auction_id']

        seller_data_of_auction = fetch_seller_data_from_auction(auction_id)
        if seller_data_of_auction is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "Auction doesn't exists"})
            }

        if sort_by in ['created_at', 'payment_status', 'order_number', 'name', 'type','auction_title','payment','amount']:
            sort_criteria = [(sort_by, pymongo.ASCENDING
                              if sort_order == 'asc' else pymongo.DESCENDING)]

        # Query the MongoDB collection to find lots matching the seller email and auction ID
        search_criteria = {}
        if search_keyword:
            escaped_search_keyword = prepend_backslash(search_keyword)
            print(escaped_search_keyword)
            search_criteria["$or"] = [
                {"order_number": {"$regex": f".*{escaped_search_keyword}.*", "$options": "i"}},
                {"name": {"$regex": f".*{escaped_search_keyword}.*", "$options": "i"}}
            ]
        # Combine the search and sort criteria
        query = {"seller_email": seller_email,"auction_id": auction_id,**search_criteria}
        # Check if both start and end timestamps are provided
        if start_timestamp is not None and end_timestamp is not None:
            # Add timestamp range criteria to the query
            query['created_at'] = {"$gte": start_timestamp, "$lte": end_timestamp}
        elif start_timestamp is not None:
            # Only start timestamp is provided
            query['created_at'] = {"$gte": start_timestamp}
        elif end_timestamp is not None:
            # Only end timestamp is provided
            query['created_at'] = {"$lte": end_timestamp}
        if payment_type:
            query["payment"] = payment_type
        if payment_status:
            query["payment_status"] = payment_status
        if export is not None and export == 1:
            download_link = export_as_csv(list(orders_collection.find(query)))

        # Query the MongoDB collection to find lots matching the criteria
        orders_list = orders_collection.find(query, {"_id": 1,"name": 1,"amount": 1,"created_at": 1,"order_number": 1,"payment_status": 1,"payment": 1,'auction_image':1,'auction_title':1,'currency':1}).sort(sort_criteria).skip((page-1)*limit).limit(limit)
        # Count the total number of records
        total_records = orders_collection.count_documents(query)
        # Calculate total pages
        total_pages = math.ceil(total_records / limit)
        total_orders = orders_collection.count_documents({"seller_email": seller_data_of_auction["seller_email"],"auction_id": auction_id})
        if orders_list is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "No Orders found"})
            }
        body={  "data":list(orders_list),
                "total_pages": total_pages,
                "total_records": total_records,
                "current_page": page,
                "total_orders": total_orders
        }
        print(download_link)
        if download_link is not None:
            body['csv_url']=download_link
        return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps(body,cls = Encoder)
            }
    except Exception as err:
        print(err)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
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
        # Export QR codes as CSV and upload to S3
        csv_file = os.environ["SALES_CSV_FILE"]
        s3_key = f"exports/{csv_file}"
        s3_bucket = os.environ['S3_BUCKET']
        print(s3_bucket, type(s3_bucket))
        with open(csv_file, "w") as file:
            writer = csv.DictWriter(file, ["ORDER ID", "Customer Name", "Auction Name","Order Date","Payment Type", "Payment Status"])
            writer.writeheader()
            print(333)
            # Format the created_at field as dd-mm-year
            for sale in sales:
                modified_sales = {}
                timestamp = sale['created_at']

                # Convert Unix timestamp to datetime object
                date = datetime.fromtimestamp(timestamp)
                # Format the date as a string with only the date
                formatted_date = date.strftime('%d %b %Y')
                shipping_address = sale['shipping_address']
                full_name = f"{shipping_address['first_name']} {shipping_address['last_name']}"
                modified_sales["ORDER ID"] = sale["order_number"]
                modified_sales["Customer Name"] = full_name
                modified_sales["Auction Name"] = sale['auction_title']
                modified_sales["Order Date"] = formatted_date
                modified_sales["Payment Status"] = sale["payment_status"]
                modified_sales["Payment Type"]= sale["payment"]
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
