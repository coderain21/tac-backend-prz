"""This module is used to update the auction details"""
import os
import json
import pymongo
from datetime import datetime, timezone

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def convert_timestamp_to_date(timestamp):
    # Convert the timestamp to seconds
    timestamp = timestamp / 1000
    # Create a datetime object in UTC
    dt_utc = datetime.fromtimestamp(timestamp, tz=timezone.utc)

    # Format the datetime object as a string in the desired format
    formatted_date_str = dt_utc.strftime('%Y-%m-%dT%H:%M:%S.%f+00:00')

    # Convert the formatted string back to a datetime object
    formatted_date = datetime.strptime(
        formatted_date_str, '%Y-%m-%dT%H:%M:%S.%f+00:00')
    return formatted_date


def update_auction(event, context):
    """
    The `update_auction` function updates the specified fields of an auction in a MongoDB database based
    on the request body and the auction ID.

    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. It typically includes details such as the HTTP request headers, body, path
    parameters, and more
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name, and
    other metadata. It can be used to access information about the execution context of the function
    :return: The function `update_auction` returns a JSON response with the following properties:
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
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        request_body = json.loads(event['body'])
        auction_id = event['pathParameters']['auction_id']

        # Initialize the MongoDB client
        client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        auction_record = collection.find_one(
            {"auction_id": auction_id, "seller_email": seller_email}, {"_id": 0})

        if auction_record is None:
            return {
                "statusCode": 404,
                'headers': headers,
                "body": json.dumps({"message": "Auction doesn't exists."})
            }
        auction_status = auction_record.get("status")
        if auction_status == "Draft":
            updatable_fields = {"menu_links", "logo_image", "logo_redirection_url", "title", "auction_image",
                                "description", "currency", "start_date", "end_date", "extension_type", "extension_time",
                                "extension_time_between_lots", "registration_type", "add_buyer_fees", "percentage",
                                "fees", "faq", "time_zone", "terms_and_condition", "publish_auction_results",
                                "show_bidder_location_in_bidder_history", "make_your_auction_private", "passcode",
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

        if "start_date" in request_body:
            date_converted = convert_timestamp_to_date(
                request_body["start_date"])
            request_body["start_date"] = date_converted

        if "end_date" in request_body:
            date_converted = convert_timestamp_to_date(
                request_body["end_date"])
            request_body["end_date"] = date_converted

        # Filter the request body to keep only updatable fields
        update_data = {key: value for key,
                       value in request_body.items() if key in updatable_fields}
        print(update_data)
        if len(update_data) > 0:
            collection.update_one(
                {"seller_email": seller_email, "auction_id": auction_id},
                {"$set": update_data}
            )
        client.close()
        return {
            "headers": headers,
            'statusCode': 204,
            'body': json.dumps({
            })
        }
    except Exception as err:
        print(err)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "There was an error while updating the auction"})
        }
