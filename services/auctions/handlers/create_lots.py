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
from datetime import timedelta



headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


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

        # Initialize the MongoDB client
        client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ["LOT_COLLECTION_NAME"]]
        lot_collection= db[os.environ["COUNTER_LOT"]]
        auction_collection= db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        auction = auction_collection.count_documents({'seller_email':seller_email,
                                                      'auction_id': auction_id })
        if auction == 0:
            return {
                    "statusCode": 404,
                    "body": json.dumps({"message": "No auction with the id found"})
                }
        existing_lots_count = collection.count_documents(
            {"seller_email": seller_email, "auction_id": request_body["auction_id"]})
        if user_type == 'Free' and existing_lots_count >= 10:
            return {
                    "statusCode": 400,
                    "body": json.dumps({"message": "Free users are limited to 10 lots."})
                }
        if user_type == 'Starter'and existing_lots_count >= 500:
            # Check if the user has already added 10 lots
            return {
                    "statusCode": 400,
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
        if extension_type in ['All Lots', 'Individual Lots']:
            request_body['start_date'] = auction_record['start_date']
            request_body['end_date'] = auction_record['end_date']
        elif extension_type == 'Cascaded':
            auction_record.get('')
            time_between_lots = auction_record.get('time_between_lots', 0)
            latest_lot = lot_collection.find_one(
                    {"seller_email": seller_email, "auction_id": auction_id},
                    sort=[("created_at", pymongo.DESCENDING)]
                )
            if latest_lot:
                    latest_end_date = latest_lot['end_date']
                    request_body['end_date'] = latest_end_date + timedelta(minutes=2)  # Adjust as needed
            else:
                    # If no previous lots, use auction start_date and add time_between_lots
                    request_body['end_date'] = request_body['end_date'] + timedelta(minutes=2)  # Adjust as needed
        request_body['end_date'] = int(request_body['end_date'].timestamp() * 1000)
        request_body['start_date'] = auction_record['start_date']
        # request_body['end_date'] = auction_record['end_date']
        request_body["lot_number"] = counter["starting_sequence"]
        request_body["seller_email"] = seller_email
        # Insert the lot data into the MongoDB collection
        collection.insert_one(request_body)

        # After inserting the lot, update the total_lots count for the associated auction
        auction_id = request_body["auction_id"]
        if auction_record and "total_lots" in auction_record:
            # Increment the existing "total_lots" count
            auction_collection.update_one(
                {"auction_id": auction_id, "seller_email": seller_email},
                {"$inc": {"total_lots": 1}}
            )
        else:
            # Calculate the total lots count and update the auction record
            total_lots_count = collection.count_documents({"seller_email": seller_email, "auction_id": auction_id})
            print(total_lots_count)
            auction_collection.update_one(
                {"auction_id": auction_id, "seller_email": seller_email},
                {"$set": {"total_lots": total_lots_count}}
            )

        client.close()

        return {
            "statusCode": 200,
            'headers': headers,
            "body": json.dumps({"message": "Lot added successfully."})
        }
    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }
