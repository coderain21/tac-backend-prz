"""This module is used to update the auction details"""
import os
import json
import pymongo
import boto3
import uuid
from pymongo import MongoClient
from bson import ObjectId
from lib.get import get_by_email
from lib.invoke_step_function import invoke_state_machine, update_redis_data
from lib.common_helper import Encoder
from datetime import datetime, timezone
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

client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]

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

    client = MongoClient(os.environ['MONGO_CLIENT'])
    db = client[os.environ['DATABASE']]
    collection_lot = db[os.environ["LOT_COLLECTION_NAME"]]

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
            seller_email = event['requestContext']['authorizer']['claims']['email']
            if ("cognito:groups" in event['requestContext']['authorizer']['claims'] and not
                    'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]):
                return {
                    "statusCode": 403,
                    "headers": headers,
                    "body": json.dumps({"message": "do not have access to perform this API action"})
                }
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        request_body = json.loads(event['body'])
        end_date = request_body.get('end_date', None)
        auction_id = event['pathParameters']['auction_id']
        if event['queryStringParameters'] is not None:
            published_status = event['queryStringParameters'].get(
                'published', 'false')
        else:
            published_status = 'false'

        # Initialize the MongoDB client
        collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        collection_lot = db[os.environ["LOT_COLLECTION_NAME"]]
        collection_seller = db[os.environ["SELLERS_TABLE"]]
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
            kyc_kyb_review = has_kyb_or_kyc_completed(seller_email)
            if kyc_kyb_review is not True:
                return {
                        "statusCode": 400,
                        'headers': headers,
                        "body": json.dumps({"message": "Please complete the Individual or Business verification before publishing the auction."})
                    }
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
                    (auction_record['extension_type'] in ['Cascade','Indivisual Lots'] and
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

                # Split the list into batches of size 10
                user_batches = [json_serializable_list[i:i + 10] for i in range(0, len(json_serializable_list), 10)]

                sqs.send_message_batch(
                    QueueUrl='https://sqs.eu-west-2.amazonaws.com/259943215050/dev-bulk-lots-update',
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
                    # start_date_timestamp = auction_record['start_date'] / 1000
                    # date_time = datetime.utcfromtimestamp(start_date_timestamp)
                    # iso_date_with_offset = date_time.astimezone(timezone.utc).isoformat()
                    # item['start_date'] = iso_date_with_offset
                    # itemData = json.loads(json.dumps(item, cls= Encoder))
                    # invoking = invoke_state_machine(itemData, os.environ['STATE_MACHINE_LOT_ARN'])
                    # collection = db[os.environ['STEP_FUNCTION_ARN_TABLE']]
                    # step_request={}
                    # step_request['arn'] = invoking['executionArn']
                    # id_value = item['_id']
                    # step_request['lot_id'] = str(id_value)
                    # step_request['auction_id'] = auction_id
                    # step_request['seller_email'] = seller_email
                    # inserted = collection.insert_one(step_request)
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
                                "publish_auction_results", "show_bidder_location_in_bidder_history",
                                "make_your_auction_private", "passcode",
                                "font", "buttons", "header", "content_area", "footer", "paddle", "template_name"
                                }
        elif auction_status == "Accepting bids":
            updatable_fields = {"menu_links", "logo_image", "logo_redirection_url", "title", "auction_image",
                                "description", "end_date",
                                "extension_time_between_lots",
                                "faq", "publish_auction_results",
                                "show_bidder_location_in_bidder_history", "make_your_auction_private", "passcode",
                                "font", "buttons", "header", "content_area", "footer", "paddle", "template_name"
                                }
        elif auction_status == "Completed":
            updatable_fields = {}

        elif auction_status == "Published":
            updatable_fields = {"menu_links", "logo_image", "logo_redirection_url", "title", "auction_image",
                                "description", "start_date", "end_date",
                                "faq", "time_zone", "publish_auction_results",
                                "show_bidder_location_in_bidder_history", "make_your_auction_private", "passcode",
                                "font", "buttons", "header", "content_area", "footer", "paddle", "template_name"
                                }
        else:
            updatable_fields = {}
        # Filter the request body to keep only updatable fields
        update_data = {key: value for key,
                       value in request_body.items() if key in updatable_fields}
        documents = []
        if end_date != None:
            existing_lots_count = collection.count_documents(
            {"seller_email": seller_email, "auction_id": auction_id})
            extension_time_str = auction_record.get('extension_time_between_lots', '0')
            if extension_time_str != '':
                extension_time = int(extension_time_str[:1])
            else:
                extension_time=0
            start_date = auction_record['start_date']
            end_date =  request_body['end_date']
            count_import=0
            # Get the current datetime object
            current_datetime = datetime.utcnow()
            # Convert datetime to epoch time in seconds
            epoch_time_seconds = int(current_datetime.timestamp())

            # Convert epoch time to epoch milliseconds
            epoch_time_milliseconds = epoch_time_seconds * 1000
            if auction_record['status']== 'Accepting bids':
                        auction_record_str = json.dumps(auction_record, cls=Encoder)
                        json_serializable_list = json.loads(json.dumps(listLots, default=convert_object_id))
                        # Modify start_date and end_date before sending SQS
                        for item in json_serializable_list:
                            if not item['end_date'] < epoch_time_milliseconds:
                                if auction_record['extension_type'] in ["Cascade", "Individual Lots"]:
                                    item['start_date'] = start_date
                                    item['end_date'] = end_date + (existing_lots_count + count_import) * extension_time * 60 * 1000
                                    count_import += 1
                                elif auction_record['extension_type'] == "All Lots":
                                    item['start_date'] = start_date
                                    item['end_date'] = end_date
                        user_batches = [json_serializable_list[i:i + 10] for i in range(0, len(json_serializable_list), 10)]


                        # update = update_redis_data(auction_record, item )
                        sqs.send_message_batch(
                            QueueUrl='https://sqs.eu-west-2.amazonaws.com/259943215050/dev-bulk-lots-update',
                            Entries=[
                                {'Id': str(uuid.uuid4()), 'MessageBody': 'update status', 'MessageAttributes':
                                {'lots': {'DataType': 'String', 'StringValue': json.dumps(item)},
                                'auction': {'DataType': 'String', 'StringValue': auction_record_str,
                                },
                                'type': {'DataType': 'String', 'StringValue':'update'},
                                # 'status': {'DataType': 'String', 'StringValue': str(data['status'])}
                                }} for item in user_batches
                            ]
                        )
            # for item in listLots:
            #     if not item['end_date'] < epoch_time_milliseconds:
            #         if auction_record['extension_type'] in ["Cascade","Individual Lots"]:
            #             item['start_date'] = start_date
            #             item['end_date'] = end_date + (existing_lots_count + count_import)* extension_time*60*1000
            #             count_import= count_import+1
            #         elif auction_record['extension_type']== "All Lots":
            #             item['start_date'] = start_date
            #             item['end_date'] = end_date
            #         if auction_record['status']== 'Accepting bids':
            #             auction_record_str = json.dumps(auction_record, cls=Encoder)
            #             json_serializable_list = json.loads(json.dumps(listLots, default=convert_object_id))
            #             user_batches = [json_serializable_list[i:i + 10] for i in range(0, len(json_serializable_list), 10)]

            #             # update = update_redis_data(auction_record, item )
            #             sqs.send_message_batch(
            #                 QueueUrl='https://sqs.eu-west-2.amazonaws.com/259943215050/dev-bulk-lots-update',
            #                 Entries=[
            #                     {'Id': str(uuid.uuid4()), 'MessageBody': 'update status', 'MessageAttributes':
            #                     {'lots': {'DataType': 'String', 'StringValue': json.dumps(item)},
            #                     'auction': {'DataType': 'String', 'StringValue': auction_record_str,
            #                     },
            #                     'type': {'DataType': 'String', 'StringValue':'update'},
            #                     # 'status': {'DataType': 'String', 'StringValue': str(data['status'])}
            #                     }} for item in user_batches
            #                 ]
            #             )
            #     documents.append(item)

            # for item in documents:
            #     item_id = ObjectId(item['_id'])
            #     if not item['end_date'] < epoch_time_milliseconds:
            #         findvalue = collection_lot.find({"_id": item_id})
            #         result = collection_lot.update_many(
            #                 {"_id": item_id},
            #                 {
            #                     "$set": {
            #                         "start_date": item['start_date'],
            #                         "end_date": item['end_date']
            #                     }
            #                 }
            #         )
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