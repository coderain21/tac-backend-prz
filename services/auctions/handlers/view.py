"""This module is used to view the auction with auction id"""
import json
import os
from bson import ObjectId
from pymongo import MongoClient
from lib.common_helper import Encoder
from datetime import datetime

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
lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]



def view(event, context):
    """
    The `view` function retrieves auction data based on the provided auction ID and the authenticated
    user's email address.
    :param event: The `event` parameter is a dictionary that contains information about the event that
    triggered the function. It typically includes details such as the HTTP request, headers, and body
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the function. It includes details such as the AWS request ID, function name,and
    other contextual information.In this code snippet, the `context` parameter is not used, but it is
    typically included in AWS Lambda function
    :return: a JSON response with a status code, headers, and a body. The specific response depends on
    the conditions and data being processed in the function.
    """
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
            print('email', email_address)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        data = event['queryStringParameters']
        if data is None or "auction_id" not in data:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Please provide auction_id"})
            }

        auction_id = data["auction_id"]
        projection = {
            "_id": 1,
            "auction_id": 1,
            "title": 1,
            "start_date": 1,
            "end_date": 1,
            "first_lot_end_date": 1,
            "status": 1,
            "auction_image": 1,
            "note": 1,
            "created_at": 1,
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
            "passcode": 1,
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
            "location": 1,
            "start_time_zone": 1,
            "end_time_zone": 1,
            "auction_type": 1,
        }
        result = collection.find_one({"_id":ObjectId(auction_id), "seller_email": email_address}, projection)
        if result is None:
            return {
                "headers": headers,
                "statusCode": 404,
                "body": json.dumps({"message": "Auction with associated auction_id doesn't exists"})
            }
        if result['status']=='draft':
            if "paddle" in result and "_id" in result["paddle"]:
                del result["paddle"]["_id"]
            # client.close()
            body = {
                "data": result,
            }
            return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps(body, cls=Encoder)
            }
        # end_time= result['end_date']
        end_time = result.get('end_date', None)
        current_time = datetime.timestamp(datetime.now())
        current_time=current_time*1000
        if end_time is not None:
            if current_time >= end_time:
                # Auction has ended
                updated_status = "Completed"
            else:
                updated_status = result["status"]
        else:
            updated_status = result["status"]  # No change in status
        # Update the status in the database
        collection.update_one({"_id": auction_id}, {
                              "$set": {"status": updated_status}})
        result = collection.find_one({"_id": ObjectId(auction_id)}, projection)
        if result is None:
            return {
                "headers": headers,
                "statusCode": 404,
                "body": json.dumps({"message": "Auction with associated auction_id doesn't exists"})
            }

        # if result["template_name"] == "Single Lot":
        #     lots = lot_collection.find({"auction_id": result["auction_id"], "seller_email": email_address})
        #     # Convert cursor to list and get the first lot since it's a single lot template
        #     lot = next(lots, None)
        #     if lot and 'images' in lot:
        #         result["auction_image"] = [image['url'] for image in lot['images'] if image.get('featured')]

        if "paddle" in result and "_id" in result["paddle"]:
            del result["paddle"]["_id"]
        # client.close()
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
