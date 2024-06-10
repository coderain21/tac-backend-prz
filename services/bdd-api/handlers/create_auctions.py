"""
This Lambda function serves as an entry point for handling requests related to adding lots to an auction system.
It performs several key actions, including:

1. Parsing the incoming JSON request.
2. Verifying the user's access based on the JWT token.
3. Checking user type limits (Free or Starter) for adding lots to an auction.
4. Managing MongoDB connections and operations to add lots to the database.
5. Returning appropriate HTTP responses based on the success or failure of these actions.

Parameters:
    event (dict): A dictionary containing information about the triggering event that invoked the Lambda function.
                  It includes event source details, event time, and event-specific data.

    context: An object providing information about the runtime environment of the Lambda function, such as AWS request ID,
             function name, function version, and more. It is used to interact with the AWS Lambda service and access
             execution context information.

Returns:
    dict: A dictionary representing an HTTP response, including a status code, headers, and a response body.
"""

import os
import json
from bson import ObjectId
import pymongo
# from lib.invoke_step_function import invoke_state_machine
from datetime import datetime, timedelta


headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
seller_collection = db[os.environ['SELLERS_TABLE']]
counter_collection = db[os.environ['COUNTER_LOT']]
auction_collection = db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]
lot_collection = db[os.environ['LOT_COLLECTION_NAME']]


class Encoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, (ObjectId, datetime)):
            return str(o)
        return super().default(o)

def left_pad(number, target_length):
    output = str(number)
    while len(output) < target_length:
        output = '0' + output
    return output


def create(event, context):
    try:
        request_body = json.loads(event["body"])
        # email = event["requestContext"]["authorizer"]["claims"]["cognito:username"]
        # request_body["seller_email"] = email
        # print("request_body", request_body)
        # email = 'sthuthi+test3@7edge.com'
        email = request_body['seller_email']
        # request_body["seller_email"] = email
        get_user = seller_collection.find({"email_address": email})
        user_count = seller_collection.count_documents({"email_address": email})
        if user_count > 0:
            user_data = seller_collection.find_one({"email_address": email})
            if user_data:
                # print('get_user', user_data)
                request_body["seller_name"] = f"{user_data.get('first_name', '')} {user_data.get('last_name', '')}"
            else:
                print('No user found with the provided email address')
                # Handle the case when no user is found
        else:
            print('No user found with the provided email address')
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"message": "User not found"})
            }

        counter = counter_collection.find_one_and_update(
            {"seller_email": email, "record_type": "Auctions", "status": "Active"},
            {"$inc": {"starting_sequence": 1}},
            return_document=pymongo.ReturnDocument.AFTER,
            upsert=True,
        )
        sequence_number = f"A{str(counter['starting_sequence']).zfill(4)}"
        request_body["auction_id"] = sequence_number
        # Calculate the current timestamp in milliseconds
        current_timestamp_ms = int(datetime.now().timestamp() * 1000)

        # Check if end_date is provided in the request body
        if "end_date" in request_body:
            end_date_ms = request_body["end_date"]
        else:
            # Calculate the time 2 minutes from now in milliseconds if end_date is not provided
            end_date_ms = int((datetime.now() + timedelta(minutes=2)).timestamp() * 1000)

        # Assign the calculated values to the request body
        request_body["start_date"] = current_timestamp_ms
        request_body["end_date"] = end_date_ms
        auction_image = 'DomainName/BDD/ai-6.jpeg'
        print('auction image', auction_image)
        # Giving static values to create a new auction
        request_body['auction_image'] = auction_image
        request_body['template_name'] = 'Classic'
        request_body['title'] = 'BDD test'
        request_body['currency'] = 'USD'
        request_body['time_zone'] = 'IST - India Standard Time'
        request_body['status'] = 'Draft'
        request_body['logo_image'] = ''
        request_body['logo_redirection_url'] = ''
        request_body['description'] = 'test description'
        request_body["registration_type"] = 'Email only'
        request_body["add_buyer_fees"] = 'No additional fees'
        request_body['faq']=[]
        request_body['percentage'] = ''
        request_body['fees'] = ''
        request_body['terms_and_condition'] = ''
        request_body['publish_auction_results'] = False
        request_body['show_bidder_location_in_bidder_history'] = False
        request_body['make_your_auction_private'] = False
        request_body['passcode'] = ''
        request_body['font'] = {
            'header_font': '',
            'body_font': ''
        }
        request_body['buttons'] = {
            'background_color': '',
            'text_color': ''
        }
        request_body['header'] = {
            'background_color': '',
            'text_color': ''
        }
        request_body['content_area'] = {
            'background_color': '',
            'text_color': ''
        }
        request_body['footer'] = {
            'background_color': '',
            'text_color': ''
        }
        request_body['paddle'] = {
            'background_color': '',
            'text_color': ''
        }
        request_body['menu_links'] = []




        auction_result = auction_collection.insert_one(request_body)
        # print('auction_result', auction_result)

        if auction_result.acknowledged:
            # print('Created auction:', auction_result)
            auction_id = auction_result.inserted_id
            created_auction = auction_collection.find_one({"_id": auction_id})
            if created_auction:
                # print('Created auction:', created_auction)
                update_value = {"auctions_count": str(counter["starting_sequence"]).zfill(1)}
                seller_collection.update_one(
                    {"_id": ObjectId(user_data["_id"])},
                    {"$set": update_value}
                )

                create_lots = create_lot(event, sequence_number, email)
                print('create_lots', create_lots)
                return {
                "statusCode": 201,
                "headers": headers,
                "body": json.dumps({
                    "message": "Auction created successfully",
                    "auctions_id": sequence_number,
                    "auction_data": created_auction,
                    "title": request_body["title"],
                }, cls=Encoder)
            }
            else:
                return {
                    "statusCode": 400,
                    "headers": headers,
                    "message": "Something went wrong. Please try again!",
                }
        else:
            return {
                "statusCode": 400,
                "headers": headers,
                "message": "Something went wrong. Please try again!",
            }
    except Exception as error:
        print("Error", error)
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "Internal Server Error"}),
        }

def create_lot(event, auction_id, seller_email):
    """
    The lambda_handler function is the entry point for a Lambda function in Python.

    :param event: The event parameter is a dictionary that contains information about the triggering
    event that caused the Lambda function to be invoked. This can include details such as the event
    source, event time, and any data associated with the event
    :param context: The `context` parameter is an object that provides information about the runtime
    environment of the Lambda function. It includes details such as the AWS request ID,
    function name,function version, and more. This object can be used to access information about
    the execution context and to interact with the AWS Lambda service
    """
    try:
        request_body = json.loads(event['body'])
        # print('request_body', request_body)
        print('in create lot', auction_id, seller_email)

        # Initialize the MongoDB client
        auction = auction_collection.count_documents({'seller_email':seller_email,
                                                      'auction_id': auction_id })
        if auction == 0:
            return {
                    "statusCode": 404,
                    "body": json.dumps({"message": "No auction with the id found"})
                }

        # Get the next lot number for the seller
        counter = counter_collection.find_one_and_update({"auction_id": auction_id,
                                                      "seller_email": seller_email,
                                                      'record_type': 'Lots'},
                                                     {'$inc': {
                                                         'starting_sequence': 1}},
                                                     return_document=pymongo.ReturnDocument.AFTER,
                                                     upsert=True)
        auction_record = auction_collection.find_one({"auction_id": auction_id, "seller_email": seller_email})
        # Get the extension type from the auction record
        extension_type = auction_record.get('extension_type', '')
        # auction_status = auction_record.get('status', '')
        lot_image = 'DomainName/BDD/panting2.jpg'
        print('lot image', lot_image)
        #giving static values to create lots
        common_lot_info = {
            "seller_email": seller_email,
            "auction_id": auction_id,
            "extension_type": extension_type,
            "title1": 'Lot',
            "title2": '',
            "description": "<p>lot description</p>",
            "starting_price": 100,
            "low_estimate": 0,
            "high_estimate": 0,
            "shipping_details": "",
            "current_bid": 0,
            "tags": [],
            "images": [
                {
                    "url": lot_image, #static
                    "featured": True
                }
            ]
        }

        # Create two lots based on extension type
        for _ in range(4):  # Create two lots
            lot_number = get_next_lot_number(auction_id, seller_email)
            lot_info = prepare_lot_info(request_body, auction_record, lot_number, extension_type,time_between_lots=2)
            common_lot_info.update(lot_info)
            lot_collection.insert_one(common_lot_info.copy())  # Insert the lot into the collection

        update_total_lots(auction_id, seller_email)

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"message": "Two lots added successfully."})
        }

    except Exception as e:
        print('Error', e)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)})
        }

def get_next_lot_number(auction_id, seller_email):
    print('get next number')
    counter = counter_collection.find_one_and_update(
        {"auction_id": auction_id, "seller_email": seller_email, 'record_type': 'Lots'},
        {'$inc': {'starting_sequence': 1}},
        return_document=pymongo.ReturnDocument.AFTER,
        upsert=True
    )
    return counter["starting_sequence"]

def update_total_lots(auction_id, seller_email):
    print('in update total lot')
    total_lots_count = lot_collection.count_documents({"seller_email": seller_email, "auction_id": auction_id})
    auction_collection.update_one(
        {"auction_id": auction_id, "seller_email": seller_email},
        {"$set": {"total_lots": total_lots_count}}
    )



def prepare_lot_info(request_body, auction, lot_number, extension_type,time_between_lots):
    print('Starting prepare_lot_info')
    print('Extension Type:', extension_type)

    # Fetch the latest lot based on the current auction to determine the new lot's start and end dates
    latest_cursor = lot_collection.find(
        {"seller_email": auction["seller_email"], "auction_id": auction["auction_id"]},
        sort=[("lot_number", pymongo.DESCENDING)]
    ).limit(1)

    latest_lot = next(latest_cursor, None)  # Attempt to get the first result from the cursor

    if latest_lot is None:
        print('No previous lots found, setting initial times based on auction record')
        start_date = auction.get('start_date', datetime.now().timestamp() * 1000)  # Default to current time if missing
        # print('Start Date:', start_date)
        end_date = auction.get('end_date', start_date + timedelta(minutes=5).total_seconds() * 1000)
        # print('end Date:', end_date)
    else:
        if 'end_date' not in latest_lot or latest_lot['end_date'] is None:
            print('Error: Latest lot does not contain a valid end_date')
            raise ValueError('Latest lot does not contain a valid end_date')

        last_end_date = latest_lot['end_date']
        if not isinstance(last_end_date, (int, float)):
            print('Error: end_date of latest lot is not an integer or float:', type(last_end_date))
            raise TypeError('end_date of latest lot is expected to be a timestamp (int or float)')

        if extension_type in ['Cascade', 'Individual Lots']:
            start_date = last_end_date
            end_date = last_end_date + time_between_lots * 60 * 1000
        elif extension_type == 'All Lots':
            start_date = auction.get('start_date', datetime.now().timestamp() * 1000)
            end_date = auction['end_date']

        print('Calculated Start Date:', start_date, 'End Date:', end_date)

    return {
        "start_date": start_date,
        "end_date": end_date,
        "lot_number": lot_number,
        "seller_email": auction["seller_email"],
        "auction_id": auction["auction_id"]
    }
