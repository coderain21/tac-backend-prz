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
import pymongo
from lib.invoke_step_function import invoke_state_machine
from datetime import datetime, timezone
from lib.common_helper import Encoder


headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


client = pymongo.MongoClient(os.environ['MONGO_CLIENT'], maxIdleTimeMS=60000)
db = client[os.environ['DATABASE']]
collection = db[os.environ["LOT_COLLECTION_NAME"]]
lot_collection= db[os.environ["COUNTER_LOT"]]
auction_collection= db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
step_collection = db[os.environ["STEP_FUNCTION_ARN_TABLE"]]

def lambda_handler(event, context):
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
        # Parse the incoming JSON request
        try:
            seller_email = event['requestContext']['authorizer']['claims']['email']
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
            print('email', seller_email)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
        request_body = json.loads(event['body'])
        auction_id = request_body["auction_id"]

        # Check if the user_type is "Free"
        user_type = request_body.get('user_type', '')

        auction = auction_collection.count_documents({'seller_email':seller_email,
                                                      'auction_id': auction_id })
        if auction == 0:
            return {
                    "statusCode": 404,
                    "headers": headers,
                    "body": json.dumps({"message": "No auction with the id found"})
                }
        existing_lots_count = collection.count_documents(
            {"seller_email": seller_email, "auction_id": request_body["auction_id"]})
        if user_type == 'Free' and existing_lots_count >= 10:
            return {
                    "statusCode": 400,
                    "headers": headers,
                    "body": json.dumps({"message": "Free users are limited to 10 lots."})
                }
        if user_type == 'Starter'and existing_lots_count >= 500:
            # Check if the user has already added 10 lots
            return {
                    "statusCode": 400,
                    "headers": headers,
                    "body": json.dumps({"message": "Starter users are limited to 500 lots."})
                }

        # Remove the "user_type" field from the request
        request_body.pop("user_type", None)

        # Get the next lot number for the seller
        counter = lot_collection.find_one_and_update({"auction_id": auction_id,
                                                      "seller_email": seller_email,
                                                      'record_type': 'Lots'},
                                                     {'$inc': {
                                                         'starting_sequence': 1}},
                                                     return_document=pymongo.ReturnDocument.AFTER,
                                                     upsert=True)
        auction_record = auction_collection.find_one({"auction_id": auction_id, "seller_email": seller_email})
        # Get the extension type from the auction record
        extension_type = auction_record.get('extension_type', '')
        auction_status = auction_record.get('status', '')
        if extension_type in ['All Lots']:
            request_body['start_date'] = auction_record['start_date']
            request_body['end_date'] = auction_record['end_date']
        elif  extension_type in ['Cascade', 'Individual Lots']:
            auction_record.get('')
            time_between_lots = auction_record.get('time_between_lots', 0)
            latest = collection.find(
                    {"seller_email": seller_email, "auction_id": auction_id},
                    sort=[("lot_number", pymongo.DESCENDING)]
                )
            latest_lot = list(latest)
            print('latest', latest_lot, auction_record)
            extension_time_str = auction_record.get('extension_time_between_lots', '0')
            extension_time = 2  # Convert the string to an integer
            if extension_time_str != '':
                extension_time = int(extension_time_str)  # Convert the string to an integer
            print('extension_time', extension_time)
            if len(latest_lot) > 0:
                latest_end_date = latest_lot[0]['end_date']
                request_body['start_date'] = latest_lot[0]['start_date']
                request_body['end_date'] = latest_end_date + extension_time*60*1000
            else:
                # If no previous lots, use auction start_date and add time_between_lots
                request_body['start_date'] = auction_record.get('start_date', 0)
                end_date = auction_record.get('end_date', 0)  # Assuming a default value of current datetime if 'end_date' is not available
                enddate= end_date
                request_body['end_date'] = enddate
            updateCheck = auction_collection.update_one({'seller_email': seller_email,'auction_id': auction_id},{'$set': {'end_date': request_body['end_date']}})

        request_body["lot_number"] = counter["starting_sequence"]
        request_body["seller_email"] = seller_email

        # Insert the lot data into the MongoDB collection
        inserting = collection.insert_one(request_body)
        if  auction_status in ['Published', 'Accepting bids']:
            inserted_id = inserting.inserted_id
            start_date_timestamp = auction_record['start_date'] / 1000
            date_time = datetime.utcfromtimestamp(start_date_timestamp)
            iso_date_with_offset = date_time.astimezone(timezone.utc).isoformat()
            request_body['start_date'] = iso_date_with_offset
            itemData = json.loads(json.dumps(request_body, cls= Encoder))
            invoking = invoke_state_machine(itemData, os.environ['STATE_MACHINE_LOT_ARN'])
            step_request={}
            step_request['arn'] = invoking['executionArn']
            id_value = str(inserted_id)
            step_request['lot_id'] = id_value
            step_request['auction_id'] = auction_record['auction_id']
            step_request['seller_email'] = auction_record['seller_email']
            inserted = step_collection.insert_one(step_request)


        # After inserting the lot, update the total_lots count for the associated auction
        auction_id = request_body["auction_id"]
        # skipping the total lots conditions as some of the auction is not having the total lots count
        if auction_record:
            # Increment the existing "total_lots" count
            # Prepare updates for auction document
            update_operations = {"$inc": {"total_lots": 1}}

            # Add auction image update if Single Lot template
            if auction_record['template_name'] == 'Single Lot':
                update_operations["$set"] = {"auction_image": request_body['images']}

            # Execute single update with combined operations
            auction_collection.update_one(
                {"auction_id": auction_id, "seller_email": seller_email},
                update_operations,
                upsert=True
            )
        else:
            # Calculate the total lots count and update the auction record
            total_lots_count = collection.count_documents({"seller_email": seller_email, "auction_id": auction_id})
            print(total_lots_count)
            auction_collection.update_one(
                {"auction_id": auction_id, "seller_email": seller_email},
                {"$set": {"total_lots": total_lots_count}}
            )
        return {
            "statusCode": 200,
            'headers': headers,
            "body": json.dumps({"message": "Lot added successfully."})
        }
    except Exception as e:
        print(e)
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }
