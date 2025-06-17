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
client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
orders_collection = db[os.environ['ORDERS_COLLECTION']]
buyer_collection = db[os.environ['BUYER_COLLECTION']]
user_collection = db[os.environ['SELLERS_TABLE']]

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
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
            print('email', email_address)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        # Connect to MongoDB
        # print('Event:', json.dumps(event, indent=2))
        # result= user_collection.find_one({"user_type":"admin","email_address":email_address})
        # if result is None:
        #     return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }

        # Extract buyer ID from path parameters
        id = event['pathParameters'].get('id', '')

        if not id:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Invalid request, buyer ID not provided"})
            }

        # Fetch buyer details from MongoDB
        buyer_details = buyer_collection.find_one({"_id": ObjectId(id)})

        if buyer_details is None:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "User doesn't exist"})
            }

        # Extract parameters from the request, defaulting to empty dictionary if not present
        data = event.get('queryStringParameters', {}).copy() if event.get('queryStringParameters') else {}


        # Extract individual parameters with default values
        sort_by = data.get('sort_by', 'created_at')
        sort_order = data.get('sort_order', 'descending')
        payment_type = data.get("payment_type", '')
        payment_status = data.get("payment_status", '')
        page = int(data.get('page', '1'))
        limit = int(data.get('per_page', '10'))

        print('Page:', page)
        print('Limit:', limit)

        # Initialize sort_criteria with a default value
        sort_criteria = []

        if sort_by and sort_by in ['created_at', 'payment_status', 'order_number', 'name', 'payment_status', 'auction_title', 'payment', 'amount']:
            sort_criteria = [(sort_by, pymongo.ASCENDING if sort_order == 'ascending' else pymongo.DESCENDING)]

        # Build the query based on parameters
        query = {"email_address": buyer_details['email_address']}
        if payment_type:
            query["payment"] = payment_type
        if payment_status:
            query["payment_status"] = payment_status

        # Query the MongoDB collection
        # Use cursor-based pagination instead of skip
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
            # "total_orders": total_records
        }

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
                date = datetime.fromtimestamp(sale['created_at'])
                # Format the date as a string with only the date
                formatted_date = date.strftime('%Y-%m-%d')
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
