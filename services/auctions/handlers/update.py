"""This module is used to update the auction details"""
import os
import json
import pymongo

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


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
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        updatable_fields = {"menu_links", "logo_image", "logo_redirection_url", "title", "auction_image",
                            "description", "currency", "start_date", "end_date", "extension_type", "extension_time",
                            "extension_time_between_lots", "registration_type", "add_buyer_fees", "percentage",
                            "fees", "faq", "time_zone", "terms_and_condition", "publish_auction_results",
                            "show_bidder_location_in_bidder_history", "make_your_auction_private", "passcode",
                            "font", "buttons", "header", "content_area", "footer", "paddle",
                            }

        request_body = json.loads(event['body'])
        auction_id = event['pathParameters']['auction_id']

        # Filter the request body to keep only updatable fields
        update_data = {key: value for key,
                       value in request_body.items() if key in updatable_fields}
        print(update_data)
        if len(update_data) > 0:
            # Initialize the MongoDB client
            client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
            db = client[os.environ['DATABASE']]
            collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]

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
