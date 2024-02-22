'''this api will list all the buyers'''
import json
import os
import re
from pymongo import MongoClient
from lib.common_helper import Encoder
import boto3
import tempfile
import csv



headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]

def prepend_backslash(text):
    # Define a regular expression pattern to match special characters
    special_chars_pattern = re.compile(r'([\\.*+?()|[\]{}^$])')
    # Use re.sub to replace each match with a backslash followed by the matched character
    modified_text = re.sub(special_chars_pattern, r'\\\1', text)
    return modified_text

def list_bidders(event, context):
    try:
        # try:
        #     email_address = event['requestContext']['authorizer']['claims']['cognito:username']
        # except:
        #     return {
        #         "statusCode": 403,
        #         "headers": headers,
        #         "body": json.dumps({"message": "You do not have access to perform this API action"})
        #     }
        email_address = 'anusha.k+subdomain@7edge.com'
        buyer_collection = db[os.environ["REGISTER_AUCTION_COLLECTION"]]
        # Default sorting by name
        sort_key = 'created_at'
        # Check if sorting key is provided
        projection = {
            "email_address": 1,
            "created_at": 1,
            "name": 1,
            "marketing": 1,
            "auction_id": 1
        }
        export = event['queryStringParameters'].get('export', False)
        if 'queryStringParameters' in event and 'sort_by' in event['queryStringParameters']:
            sort_key = event['queryStringParameters']['sort_by']

        # Sorting order (default: ascending)
        sort_order = 1
        if 'queryStringParameters' in event and 'sort_order' in event['queryStringParameters']:
            sort_order = 1 if event['queryStringParameters']['sort_order'].lower() == 'ascending' else -1

        # Search options
        search_query = {'seller_email': email_address}
        if 'queryStringParameters' in event and 'search' in event['queryStringParameters']:
            search_text = event['queryStringParameters']['search']
            search_text = prepend_backslash(search_text)
            search_query['$or'] = [
                {"name": {"$regex": search_text, "$options": "i"}},
                {"email_address": {"$regex": search_text, "$options": "i"},
                }
            ]

        # Pagination options
        page_size = 10
        page_number = 1
        if 'queryStringParameters' in event:
            if 'page_number' in event['queryStringParameters']:
                page_number = int(event['queryStringParameters']['page_number'])
            if 'per_page' in event['queryStringParameters']:
                page_size = int(event['queryStringParameters']['per_page'], 10)

        # Total buyers count
        total_buyers = buyer_collection.count_documents(search_query)

        # Fetching unique buyers based on email address with sorting, pagination, and search options
        if export:
            print('11')
            pipeline = [
                {"$match": search_query},
                {"$lookup": {
                    "from": os.environ["AUCTION_MONGODB_COLLECTION_NAME"],
                    "localField": "auction_id",
                    "foreignField": "_id",
                    "as": "auction_info"
                }},
                {"$unwind": "$auction_info"},
                {"$lookup": {
                    "from": os.environ["AUCTION_MONGODB_COLLECTION_NAME"],
                    "localField": "auction_info.auction_id",
                    "foreignField": "auction_id",
                    "as": "auction_details"
                }},
                {"$unwind": "$auction_details"},
                {"$addFields": {"time_zone": "$auction_details.time_zone"}},  # Add the time_zone field
                {"$group": {"_id": "$email_address", "firstRecord": {"$first": "$$ROOT"}}},
                {"$replaceRoot": {"newRoot": "$firstRecord"}},
                {"$sort": {sort_key: sort_order}},
                {"$project": {"email_address": 1, "created_at": 1, "name": 1, "marketing": 1, "auction_id": 1, "time_zone": 1}},

            ]
        else:
            pipeline = [
                {"$match": search_query},
                {"$lookup": {
                    "from": os.environ["AUCTION_MONGODB_COLLECTION_NAME"],
                    "localField": "auction_id",
                    "foreignField": "_id",
                    "as": "auction_info"
                }},
                {"$unwind": "$auction_info"},
                {"$lookup": {
                    "from": os.environ["AUCTION_MONGODB_COLLECTION_NAME"],
                    "localField": "auction_info.auction_id",
                    "foreignField": "auction_id",
                    "as": "auction_details"
                }},
                {"$unwind": "$auction_details"},
                {"$addFields": {"time_zone": "$auction_details.time_zone"}},  # Add the time_zone field
                {"$group": {"_id": "$email_address", "firstRecord": {"$first": "$$ROOT"}}},
                {"$replaceRoot": {"newRoot": "$firstRecord"}},
                {"$sort": {sort_key: sort_order}},
                {"$skip": (page_number - 1) * page_size },
                {"$limit": page_size},
                {"$project": {"email_address": 1, "created_at": 1, "name": 1, "marketing": 1, "auction_id": 1, "time_zone": 1}},

            ]


        print('pipeline', pipeline)
        buyers = buyer_collection.aggregate(pipeline)
        total_buyers_pipeline = [
            {"$match": search_query},
            {"$group": {"_id": None, "unique_emails": {"$addToSet": "$email_address"}}},
            {"$addFields": {"total_buyers": {"$size": "$unique_emails"}}},
            {"$project": {"_id": 0, "total_buyers": 1}},
        ]

        print('total_buyers_pipeline', total_buyers_pipeline)
        total_buyers_result = list(buyer_collection.aggregate(total_buyers_pipeline))
        print('total_buyers_result', total_buyers_result)
        total_buyers = total_buyers_result[0]["total_buyers"] if total_buyers_result else 0

        collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        projection = {
            "time_zone": 1
        }
        result_time_zone = collection.find_one({"seller_email": email_address}, projection)
        print('time_zone', result_time_zone)
        response_body = {
            "buyers": list(buyers),
            "total_buyers": total_buyers,
            "page_size": page_size,
            "page_number": page_number,
            "time_zone": result_time_zone['time_zone'] if result_time_zone else None
        }

        download_link = ''
        if export:
            download_link = export_bidders_as_csv(response_body['buyers'], email_address)
        if download_link is not None:
            response_body["csv_url"] = download_link

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(response_body, cls=Encoder)
        }

    except Exception as e:
        print('ee', str(e))
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)})
        }


def export_bidders_as_csv(buyers, email_address):
    """
    The function exports lots of data as a CSV file using a database connection.
    :param lots: A list of dictionaries representing lots of data
    :param db: The `db` parameter is a database connection object that allows you to interact with a
    database. It can be used to execute SQL queries, fetch data, and perform other database operations
    """
    try:
        collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        projection = {
            "time_zone": 1
        }
        result = collection.find_one({"seller_email": email_address}, projection)
        print('results', result)
        auction_id = str(buyers[0].get('seller_email', ''))
        filename = 'All'
        # Use a temporary directory
        temp_dir = tempfile.mkdtemp()
        csv_file_path = os.path.join(temp_dir, f'{filename}_bidders.csv')

        s3_key = f"exports/lots/{auction_id}/All Bidders.csv"
        s3_bucket = os.environ['S3_BUCKET']

        with open(csv_file_path, "w") as file:
            writer = csv.DictWriter(file, ["Name","Email", "Account Created", "Marketing"])
            timezone_abbreviation = result['time_zone'].split(' ')[0]

            writer.writeheader()
            for buyer in buyers:
                # Prepend the S3 URL to the thumbnail URL
                print('buyer', buyer)
                marketing_status = "Subscribed" if buyer.get("marketing", False) else "Unsubscribed"
                writer.writerow({
                    "Name": buyer.get("name", ""),
                    "Email": buyer.get("email_address", ""),
                    "Account Created": buyer.get("created_at", "").strftime("%d %b %Y / %H:%M") + ' ' + timezone_abbreviation,
                    "Marketing": marketing_status,
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
        return s3_signed_url
    except Exception as err:
        print("Error:", err)
        return None
