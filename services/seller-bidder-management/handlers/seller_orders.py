'''this api will list all the orders'''
import json
import os
import re
import pymongo
from pymongo import MongoClient
from lib.common_helper import Encoder
import math
import csv
import boto3
import tempfile
import datetime

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

#database
client = MongoClient(os.environ['MONGO_CLIENT'], maxIdleTimeMS=60000)
db = client[os.environ['DATABASE']]
orders_collection = db[os.environ['ORDERS_COLLECTION']]
# buyer_collection = db[os.environ['BUYER_COLLECTION']]
# user_collection = db[os.environ['SELLERS_TABLE']]

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
            email_address = event['requestContext']['authorizer']['claims']['cognito:username']
            print('email', email_address)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        # email_address = 'sthuthi+test3@7edge.com'
        # Extract parameters from the request, defaulting to empty dictionary if not present
        data = event.get('queryStringParameters', {}).copy() if event.get('queryStringParameters') else {}


        # Extract individual parameters with default values
        sort_by = data.get('sort_by', 'created_at')
        sort_order = data.get('sort_order', 'descending')
        page = int(data.get('page', '1'))
        limit = int(data.get('per_page', '10'))
        filters = data.get('filter', False)

        #filter for created_at
        start_date = data.get('start_date', None)
        end_date = data.get('end_date', None)

        #filter for payment
        payment_type = data.get("payment_type", '')
        payment_status = data.get("payment_status", '')


        # export parameter
        export = data.get("export", False)


        print('Page:', page)
        print('Limit:', limit)
        print('Start Date:', start_date)
        print('End Date:', end_date)
        print('Payment Type:', payment_type)
        print('Payment Status:', payment_status)


        search_query = {}
        if 'search' in data:
            search_text = prepend_backslash(data['search'])
            search_query['$or'] = [
                {"name": {"$regex": search_text, "$options": "i"}},
                {"auction_title": {"$regex": search_text, "$options": "i"}},
                {"order_number": {"$regex": search_text, "$options": "i"}}
            ]

        print('Search Query:', search_query)

        # Initialize sort_criteria with a default value
        sort_criteria = []
        if sort_by and sort_by in ['name', 'auction_title', 'created_at']:
            sort_criteria = [(sort_by, pymongo.ASCENDING if sort_order == 'ascending' else pymongo.DESCENDING)]
        # Build the query based on parameters
        query = {"seller_email": email_address}
        if filters:
            if payment_type:
                query["payment"] = payment_type
            if payment_status:
                query["payment_status"] = payment_status
            if start_date and end_date:
                start_date = int(start_date)
                end_date = int(end_date) 
                
                # Adjust start_date to the beginning of the day and end_date to the end of the day
                # start_datetime = datetime.utcfromtimestamp(start_date).replace(hour=0, minute=0, second=0, microsecond=0)
                # end_datetime = datetime.utcfromtimestamp(end_date).replace(hour=23, minute=59, second=59, microsecond=999999)

                # start_date = int(start_datetime.timestamp())
                # end_date = int(end_datetime.timestamp())
                date_range_condition = {
                    "created_at": {
                        "$gte": start_date,
                        "$lte": end_date
                    }
                }
                print('date_range_condition',date_range_condition)
                query.update(date_range_condition)

        if search_query:
            query.update(search_query)

        print('Final Query:', query)

        orders_list = orders_collection.find(
            query,
            {
                "_id": 1,
                "name": 1,
                "created_at": 1,
                "order_number": 1,
                "payment_status": 1,
                "payment": 1,
                "amount": 1,
                "currency": 1,
                "auction_title": 1
            }
        ).sort(sort_criteria).skip((page - 1) * limit).limit(limit)

        total_records = orders_collection.count_documents(query)
        total_pages = math.ceil(total_records / limit)

        if not orders_list:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "No Orders found"})
            }
        body = {
            "data": list(orders_list),
            "total_pages": total_pages,
            "total_records": total_records,
            "current_page": page,
            "download_link": None
        }

        if export:
            body["download_link"] = export_as_csv(orders_collection.find(query, {
                "_id": 1,
                "name": 1,
                "created_at": 1,
                "order_number": 1,
                "payment_status": 1,
                "payment": 1,
                "amount": 1,
                "currency": 1,
                "auction_title": 1
            }).sort(sort_criteria), email_address)

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(body, cls=Encoder)
        }
    except Exception as err:
        print('Error:', str(err))
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "Internal Server Error"})
        }



def format_date(date_value):
    try:
        if isinstance(date_value, int):
            # Treat the value as a Unix timestamp (seconds since epoch)
            date_obj = datetime.datetime.fromtimestamp(date_value)
        else:
            # Treat the value as a formatted string
            date_obj = datetime.datetime.strptime(date_value, '%Y-%m-%dT%H:%M:%S.%fZ')

        # Format the datetime object as "03 June 2024"
        formatted_date = date_obj.strftime('%d %B %Y')

        return formatted_date

    except Exception as e:
        print("Error:", e)
        return None




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









def export_as_csv(sales, email_address):
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
        filename = "Orders"
        seller_email = email_address
        temp_dir = tempfile.mkdtemp()
        csv_file = os.path.join(temp_dir, f'{filename}.csv')

        s3_key = f"exports/seller/{seller_email}/{filename}.csv"
        s3_bucket = os.environ['S3_BUCKET']
        print(s3_bucket, type(s3_bucket))
        with open(csv_file, "w") as file:
            writer = csv.DictWriter(file, ["Order Number", "Customer Name", "Auction Name","Date","Result", "Payment type", "Payment status"])
            writer.writeheader()
            print(333)
            # Format the created_at field as dd-mm-year
            for sale in sales:
                modified_sales = {}
                currency = sale.get("currency", "")
                if currency in currencySymbolMapping:
                    currency = currencySymbolMapping.get(currency, "")
                date = format_date(int(sale['created_at']))
                # Format the date as a string with only the date
                formatted_date = date
                # shipping_address = sale['shipping_address']
                full_name = sale['name']
                modified_sales["Order Number"] = sale["order_number"]
                modified_sales["Customer Name"] = full_name
                modified_sales["Auction Name"] = sale['auction_title']
                modified_sales["Date"] = formatted_date
                modified_sales["Result"] = currency + str(sale["amount"])
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
