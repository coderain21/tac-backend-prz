"""This module is used to view the auction with auction id"""
import json
import os
from pymongo import MongoClient
from bson import ObjectId
from lib.common_helper import Encoder
import pytz
from datetime import datetime

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def view(event, context):
    """
    The `view` function retrieves auction data based on the provided auction ID and the authenticated
    user's email address.
    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. It typically includes details such as the HTTP request, headers, and body
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name,and
    other contextual information. In this code snippet, the `context` parameter is not used, but it is
    typically included in AWS Lambda function
    :return: a JSON response with a status code, headers, and a body. The specific response depends on
    the conditions and data being processed in the function.
    """
    try:
        data = event['queryStringParameters']
        if data is None or "auction_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }
        passcode = data.get("passcode")
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        auction_id = data['auction_id']
        if auction_id is not None:
            print(auction_id,122)
            auction_id = ObjectId(auction_id)
        projection = {
            "_id": 1,
            "auction_id": 1,
            "title": 1,
            "start_date": 1,
            "end_date": 1,
            "status": 1,
            "auction_image": 1,
            "currency": 1,
            "description": 1,
            "time_zone": 1,
            "extension_type": 1,
            "extension_time": 1,
            "extension_time_between_lots": 1,
            "registration_type": 1,
            "make_your_auction_private": 1,
            "menu_links": 1,
            "footer.background_color": 1,
            "footer.text_color": 1,
            "buttons.background_color": 1,
            "buttons.text_color": 1,
            "content_area.background_color": 1,
            "content_area.text_color": 1,
            "header.background_color": 1,
            "header.text_color": 1,
            "font.hearder_font": 1,
            "font.body_font": 1,
            "logo_image": 1,
            "template_name": 1,
            "logo_redirection_url": 1,
            "faq": 1,
            "terms_and_condition": 1,
            "paddle": 1,
            "show_bidder_location_in_bidder_history": 1,
            "publish_auction_results": 1,
            "passcode": 1,
        }
        result = collection.find_one({"_id": auction_id}, projection)

        if result is None:
            return {
                "headers": headers,
                "statusCode": 404,
                "body": json.dumps({"message": "Auction with associated auction_id doesn't exists"})
            }
        if result["status"] not in ["Published", "Accepting bids", "Completed"]:
            return {
                "headers": headers,
                "statusCode": 400,
                "body": json.dumps({"message": "Auction is not published yet."})
            }
        print(result['start_date'])
        start_time= result['start_date']
        end_time= result['start_date']
        print(start_time)
        # Get the timezone from the result
        time_zone_str = result.get("time_zone")
        if not time_zone_str:
            return {
                "headers": headers,
                "statusCode": 400,
                "body": json.dumps({"message": "Timezone is missing for this auction."})
            }

        # Convert time_zone_str to a timezone object
        time_zone = time_zone_str[:3]
        print(type(time_zone))

        # Get the current time in the specified timezone
        current_time = datetime.now(pytz.timezone(time_zone))

        if time_zone == 'GMT':
            print(1)
            end_time = datetime.fromtimestamp(end_time, tz=pytz.timezone('GMT'))
            start_time = datetime.fromtimestamp(start_time, tz=pytz.timezone('GMT'))
        elif time_zone == 'BST':
            start_time = datetime.fromtimestamp(start_time, tz=pytz.timezone('Europe/London'))
            end_time = datetime.fromtimestamp(end_time, tz=pytz.timezone('Europe/London'))
        elif time_zone == 'IST':
            start_time = datetime.fromtimestamp(start_time, tz=pytz.timezone('Asia/Kolkata'))
            end_time = datetime.fromtimestamp(end_time, tz=pytz.timezone('Asia/Kolkata'))
        elif time_zone == 'CET':
            start_time = datetime.fromtimestamp(start_time, tz=pytz.timezone('Europe/Paris'))
            end_time = datetime.fromtimestamp(end_time, tz=pytz.timezone('Europe/Paris'))
        elif time_zone == 'JST':
            start_time = datetime.fromtimestamp(start_time, tz=pytz.timezone('Asia/Tokyo'))
            end_time = datetime.fromtimestamp(end_time, tz=pytz.timezone('Asia/Tokyo'))
        elif time_zone == 'AEST':
            start_time = datetime.fromtimestamp(start_time, tz=pytz.timezone('Australia/Sydney'))
            end_time = datetime.fromtimestamp(end_time, tz=pytz.timezone('Australia/Sydney'))
        elif time_zone == 'NZS':
            start_time = datetime.fromtimestamp(start_time, tz=pytz.timezone('Pacific/Auckland'))
            end_time = datetime.fromtimestamp(end_time, tz=pytz.timezone('Pacific/Auckland'))
        elif time_zone == 'PST':
            start_time = datetime.fromtimestamp(start_time, tz=pytz.timezone('America/Los_Angeles'))
            end_time = datetime.fromtimestamp(end_time, tz=pytz.timezone('America/Los_Angeles'))
        elif time_zone == 'MST':
            start_time = datetime.fromtimestamp(start_time, tz=pytz.timezone('America/Denver'))
            end_time = datetime.fromtimestamp(end_time, tz=pytz.timezone('America/Denver'))
        elif time_zone == 'CST':
            start_time = datetime.fromtimestamp(start_time, tz=pytz.timezone('America/Chicago'))
            end_time = datetime.fromtimestamp(end_time, tz=pytz.timezone('America/Chicago'))
        elif time_zone == 'EST':
            start_time = datetime.fromtimestamp(start_time, tz=pytz.timezone('America/New_York'))
            end_time = datetime.fromtimestamp(end_time, tz=pytz.timezone('America/New_York'))
        else:
            raise ValueError("Invalid time zone")

        # Convert start_time and end_time to the auction's timezone
        # start_time = result.get("start_date")
        # start_time = auction_timezone.localize(
        #     start_time)  # Make it offset-aware
        # end_time = result.get("end_date")
        # end_time = auction_timezone.localize(end_time)  # Make it offset-aware

        if start_time <= current_time < end_time:
            # Auction is currently accepting bids
            updated_status = "Accepting bids"
        elif current_time >= end_time:
            # Auction has ended
            updated_status = "Completed"
        else:
            updated_status = result["status"]  # No change in status

        # Update the status in the database
        collection.update_one({"_id": auction_id}, {
                              "$set": {"status": updated_status}})

        if "paddle" in result and "_id" in result["paddle"]:
            del result["paddle"]["_id"]
        client.close()
        print(result["make_your_auction_private"])
        print(result["passcode"])
        if result["make_your_auction_private"] is True and passcode is None:
            data = {}
            data["menu_links"] = result.get("menu_links")
            data["logo_image"] = result.get("logo_image")
            return {
                "headers": headers,
                "statusCode": 400,
                "body": json.dumps({"message": "This is a private auction ,please provide passcode.",
                                    "data": data})
            }
        elif result["make_your_auction_private"] is True and passcode is not None:
            if result["passcode"] != str(passcode):
                data = {}
                data["menu_links"] = result.get("menu_links")
                data["logo_image"] = result.get("logo_image")
                return {
                    "headers": headers,
                    "statusCode": 400,
                    "body": json.dumps({"message": "Invalid passcode.",
                                        "data": data})
                }
        result["status"] = updated_status
        del result["passcode"]
        body = {
            "data": result,
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
            "body": json.dumps({"message": "There was an error "})
        }
