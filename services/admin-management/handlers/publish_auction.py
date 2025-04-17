"""This module is used to update the auction details"""
import os
import json
import boto3
import uuid
from pymongo import MongoClient
from bson import ObjectId
from lib.get import get_by_email
from lib.common_helper import Encoder
from datetime import datetime
client = boto3.client(
    'pinpoint-email', region_name=os.environ.get('REGION', 'eu-west-2'))
sqs = boto3.client('sqs')

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

client = MongoClient(os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  )
db = client[os.environ['DATABASE']]
collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
collection_lot = db[os.environ["LOT_COLLECTION_NAME"]]
collection_seller = db[os.environ["SELLERS_TABLE"]]

class Encoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, (ObjectId, datetime)):
            return str(o)
        return super().default(o)

# Convert ObjectId to str for JSON serialization
def convert_object_id(obj):
    if isinstance(obj, ObjectId):
        return str(obj)
    return obj

def has_kyb_or_kyc_completed(email_address):
    seller_data = get_by_email(email_address, os.environ["SELLERS_TABLE"])
    if seller_data is not None:
        kyc_completed = "kyc_status" in seller_data and seller_data["kyc_status"] == "completed"
        kyb_completed = "kyb_status" in seller_data and seller_data["kyb_status"] == "completed"

        return kyc_completed or kyb_completed
    else:
        return False

def has_images_for_auction_and_seller(auction_id, seller_email):

    # client = MongoClient(
    #                   os.environ['MONGO_CLIENT'],
    #                   maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
    #                     )
    # db = client[os.environ['DATABASE']]
    # collection_lot = db[os.environ["LOT_COLLECTION_NAME"]]

    # Aggregation pipeline to check for non-empty images array
    pipeline = [
        {
            "$match": {
                "auction_id": auction_id,
                "seller_email": seller_email
            }
        },
        {
            "$redact": {
                "$cond": {
                    "if": {"$eq": [{"$size": "$images"}, 0]},
                    "then": "$$PRUNE",
                    "else": "$$KEEP"
                }
            }
        },
        {
            "$limit": 1
        }
    ]

    # Execute the aggregation pipeline
    result = list(collection_lot.aggregate(pipeline))
    return bool(result)  # True if at least one lot has non-empty images array

def update_auction(event, context):
    """
    The `update_auction` function updates the specified fields of an auction
    in a MongoDB database based on the request body and the auction ID.

    :param event: The `event` parameter is a dictionary that contains
    information about the event that
    triggered the function. It typically includes details such as the
    HTTP request headers, body, path
    parameters, and more
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other metadata. It can be used to access information about the execution context of the function
    :return: The function `update_auction` returns a JSON response with the following properties:
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
        seller_email = str(event['queryStringParameters']['seller_email'])
        request_body = json.loads(event['body'])

        if not seller_email:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "seller_email is required"})
            }
        auction_id = event['pathParameters']['auction_id']
        print('auction_id', auction_id)
        if event['queryStringParameters'] is not None:
            published_status = event['queryStringParameters'].get(
                'published', 'false')
        else:
            published_status = 'false'
        state = collection.find_one({"auction_id": auction_id, "seller_email": seller_email})

        if state['status'] == 'Published' or state['status']== 'Accepting bids':
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Auction is already published or is Accepting bids"})
            }
        # Initialize the MongoDB client
        # collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        # collection_lot = db[os.environ["LOT_COLLECTION_NAME"]]
        # collection_seller = db[os.environ["SELLERS_TABLE"]]
        total_lots = collection_lot.count_documents({"seller_email": seller_email,
                                                     "auction_id": auction_id})
        listLots = list(collection_lot.find({"seller_email": seller_email,
                                                     "auction_id": auction_id}))
        listLots = sorted(listLots, key=lambda x:x['lot_number'])

        auction_record = collection.find_one(
            {"auction_id": auction_id, "seller_email": seller_email}, {"_id": 0})
        seller_data = collection_seller.find_one(  {"seller_email": seller_email}, {"_id": 0})

        if auction_record is None:
            return {
                "statusCode": 404,
                'headers': headers,
                "body": json.dumps({"message": "Auction doesn't exists."})
            }
        if published_status == 'true':
            required_fields = ["auction_image", "title", "description", "currency",
                            "time_zone", "extension_type", "registration_type", "add_buyer_fees"]
            for field in required_fields:
                if auction_record[field]== "":
                    return {
                        "statusCode": 400,
                        'headers': headers,
                        "body": json.dumps({"message": "required and cannot be empty."})
                    }
            if ((auction_record['add_buyer_fees'] == 'Add percentage' and
                 auction_record['percentage'] == "") or
                (auction_record['add_buyer_fees'] == 'Add fixed fee'
                and auction_record['fees'] == "")):
                return {
                    "statusCode": 400,
                    'headers': headers,
                    "body": json.dumps({"message": "required fields are missing or empty."})
                }
            if ((auction_record['make_your_auction_private'] is True
                    and auction_record['passcode'] == "") or
                    (auction_record['extension_type'] in ['Cascade','Individual Lots'] and
                    auction_record['extension_time_between_lots']== "")):
                return {
                    "statusCode": 400,
                    'headers': headers,
                    "body": json.dumps({"message": "required fields are missing or empty."})
                }
            result = has_images_for_auction_and_seller(auction_id, seller_email)
            if result:
                print("All lots have images.")
            else:
                print("At least one lot has an empty array of images.")
                return {
                    "statusCode": 400,
                    'headers': headers,
                    "body": json.dumps({"message": "Some lots are missing lot images"})
                }
            if total_lots < 1:
                return {
                    "statusCode": 404,
                    'headers': headers,
                    "body": json.dumps({"message": "No Lots Found"})
                }
            else:
                # invoke_state_machine(event)
                collection.update_one(
                    {"seller_email": seller_email, "auction_id": auction_id},
                    {"$set": {"status": "Published"}}
                )
                auction_record_str = json.dumps(auction_record, cls=Encoder)
                # Convert the list of documents to a JSON-serializable format
                json_serializable_list = json.loads(json.dumps(listLots, default=convert_object_id))
                total_lots = len(json_serializable_list)
                batch_size = 30
                user_batches = []
                for i in range(0, total_lots, batch_size):
                    # Ensure all remaining items are included in the last batch
                    batch_end = min(i + batch_size, total_lots)
                    user_batches.append(json_serializable_list[i:batch_end])

                # Split the list into batches of size 10
                # user_batches = [json_serializable_list[i:i + 10] for i in range(0, len(json_serializable_list), 10)]

                sqs.send_message_batch(
                    QueueUrl= os.environ["LOT_UPDATE_QUEUE_URL"],
                    Entries=[
                        {'Id': str(uuid.uuid4()), 'MessageBody': 'update status', 'MessageAttributes':
                        {'lots': {'DataType': 'String', 'StringValue': json.dumps(item)},
                        'auction': {'DataType': 'String', 'StringValue': auction_record_str,
                        },
                        'type': {'DataType': 'String', 'StringValue':'published'},
                        # 'status': {'DataType': 'String', 'StringValue': str(data['status'])}
                        }} for item in user_batches
                    ]
                )
                return {
                    "statusCode": 204,
                    'headers': headers,
                    "body": json.dumps({'message': "suceessfull"})
                }

        auction_status = auction_record.get("status")
        if auction_status == "Draft":
            updatable_fields = {"menu_links", "logo_image", "logo_redirection_url", "title",
                                "auction_image", "description", "currency", "start_date", "end_date",
                                "extension_type", "extension_time", "extension_time_between_lots",
                                "registration_type", "add_buyer_fees", "percentage",
                                "fees", "faq", "time_zone", "terms_and_condition",
                                "publish_auction_results", "show_bidder_location_in_bidder_history", "show_bidding_history","hide_auction_lots","toggle_powered_by_indy",
                                "make_your_auction_private", "passcode",
                                "font", "buttons", "header", "content_area", "footer", "paddle", "template_name"
                                }
        elif auction_status == "Accepting bids":
            updatable_fields = {"menu_links", "logo_image", "logo_redirection_url", "title", "auction_image",
                                "description", "end_date",
                                "extension_time_between_lots",
                                "faq", "publish_auction_results",
                                "show_bidder_location_in_bidder_history", "show_bidding_history", "make_your_auction_private", "passcode",
                                "font", "buttons", "header", "content_area", "footer", "paddle", "template_name"
                                }
        elif auction_status == "Completed":
            updatable_fields = {}

        elif auction_status == "Published":
            updatable_fields = {"menu_links", "logo_image", "logo_redirection_url", "title", "auction_image",
                                "description", "start_date", "end_date",
                                "faq", "time_zone", "publish_auction_results",
                                "show_bidder_location_in_bidder_history", "show_bidding_history", "make_your_auction_private", "passcode",
                                "font", "buttons", "header", "content_area", "footer", "paddle", "template_name", "hide_auction_lots"
                                }
        else:
            updatable_fields = {}
        # Filter the request body to keep only updatable fields
        update_data = {key: value for key,
                       value in request_body.items() if key in updatable_fields}
        if len(update_data) > 0:
            collection.update_one(
                {"seller_email": seller_email, "auction_id": auction_id},
                {"$set": update_data}
            )
        return {
            "headers": headers,
            'statusCode': 204,
            'body': json.dumps({
            })
        }
    except Exception as err:
        print('errr', err)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "There was an error while updating the auction"})
        }