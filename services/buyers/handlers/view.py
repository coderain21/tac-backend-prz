"""This module is used to view the auction with auction id"""
import json
import os
from datetime import datetime
from pymongo import MongoClient
from bson import ObjectId
from lib.common_helper import Encoder
import pytz
from lib.get import fetch_seller_data_from_subdomain

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]

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
        auction_id = data['auction_id']
        # Check if auction_id exists and convert it to ObjectId
        # If auction_id is missing, return 422 error
        try:
            if auction_id:
                auction_id = ObjectId(auction_id)
            else:
                return {
                    "statusCode": 422, 
                    "headers": headers,
                    "body": json.dumps({"message": "Auction ID is required"})
                }
        except Exception as e:
            # If auction_id cannot be converted to ObjectId, return 422 error
            print('Error:', str(e))
            return {
                "statusCode": 422,
                "headers": headers, 
                "body": json.dumps({"message": "Invalid auction ID format"})
            }
        domain_data = fetch_seller_data_from_subdomain(str(auction_id))
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
            "add_buyer_fees": 1,
            "fees": 1,
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
            "percentage": 1,
            "template_name": 1,
            "logo_redirection_url": 1,
            "faq": 1,
            "terms_and_condition": 1,
            "paddle": 1,
            "show_bidding_history": 1,
            "toggle_powered_by_indy": 1,
            "hide_auction_lots": 1,
            "show_bidder_location_in_bidder_history": 1,
            "publish_auction_results": 1,
            "passcode": 1,
            "seller_email": 1
        }
        time_zones = {
            'GMT': 'GMT',
            'BST': 'Europe/London',
            'IST': 'Asia/Kolkata',
            'CET': 'Europe/Paris',
            'JST': 'Asia/Tokyo',
            'AES': 'Australia/Sydney',
            'NZS': 'Pacific/Auckland',
            'PST': 'America/Los_Angeles',
            'MST': 'America/Denver',
            'MDT': 'America/Denver',
            'CST': 'America/Chicago',
            'EST': 'America/New_York',
            'UTC': 'UTC'
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
                "statusCode": 404,
                "body": json.dumps({"message": "Auction is not published yet."})
            }

        start_time=result['start_date']
        end_time= result['end_date']
        time_zone_str = result.get("time_zone")
        if not time_zone_str:
            return {
                "headers": headers,
                "statusCode": 400,
                "body": json.dumps({"message": "Timezone is missing for this auction."})
            }

        # Convert time_zone_str to a timezone object
        time_zone_str = time_zone_str[:3]
        time_zone = time_zones[time_zone_str]
        # Get the current time in the specified timezone
        current_time = datetime.now(pytz.timezone(time_zone))
        current_time= datetime.timestamp(current_time)
        current_time=current_time*1000
        print(current_time)
        if not time_zone_str:
            return {
                "headers": headers,
                "statusCode": 400,
                "body": json.dumps({"message": "Timezone is missing for this auction."})
            }
        if "paddle" in result and "_id" in result["paddle"]:
            del result["paddle"]["_id"]
        # client.close()
        if result["make_your_auction_private"] is True and passcode is None:
            data = {}
            data["menu_links"] = result.get("menu_links")
            data["logo_image"] = result.get("logo_image")
            data["header"] = result.get("header")
            data["font"] = result.get("font")
            data["buttons"] = result.get("buttons")
            data['title'] = result.get("title")
            data['content_area'] = result.get("content_area")
            object_id = result.get("_id")
            data['_id'] = str(object_id) if isinstance(object_id, ObjectId) else object_id
            if domain_data is not None:
                data["sub_domain"] = domain_data["subdomain"]
            return {
                "headers": headers,
                "statusCode": 400,
                "body": json.dumps({"message":"This is a private auction,please provide passcode",
                                    "data": data, })
            }
        elif result["make_your_auction_private"] is True and passcode is not None:
            if result["passcode"] != str(passcode):
                data = {}
                data["menu_links"] = result.get("menu_links")
                data["logo_image"] = result.get("logo_image")
                data["footer"] = {
                    "background_color": result.get("footer", {}).get("background_color"),
                    "text_color": result.get("footer", {}).get("text_color")
                }
                data["buttons"] = {
                    "background_color": result.get("buttons", {}).get("background_color"), 
                    "text_color": result.get("buttons", {}).get("text_color")
                }
                data["content_area"] = {
                    "background_color": result.get("content_area", {}).get("background_color"),
                    "text_color": result.get("content_area", {}).get("text_color") 
                }
                data["header"] = {
                    "background_color": result.get("header", {}).get("background_color"),
                    "text_color": result.get("header", {}).get("text_color")
                }
                data["font"] = {
                    "header_font": result.get("font", {}).get("header_font")
                }

                return {
                    "headers": headers,
                    "statusCode": 400,
                    "body": json.dumps({"message": "Invalid passcode.",
                                        "data": data})
                }
        # result["status"] = updated_status
        del result["passcode"]
        if domain_data is not None:
            result["sub_domain"] = domain_data["subdomain"]
        body = {
            "data": result,
        }
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(body, cls=Encoder)
        }
    except Exception as e:
        print(e)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
        }
