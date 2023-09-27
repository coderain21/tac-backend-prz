"""This module is used to reorder lots"""
import json
import os
from pymongo import MongoClient

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def reorder_lots(event):
    """
    The `reorder_lots` accepts auction id and the lot number that has to be re-ordered along with the new position.

    :param auction_id: The `auction_id` for which the lots has to be reordered. 
    :param reorder_lot_number: The `reorder_lot_number` parameter denotes the lot that has to be re-ordered.
    :param reorder_position: The position to which the lot has to be moved too. 

    :return: a JSON response with the following properties:
    - "statusCode": The HTTP status code of the response (204 for success, 403 for access denied, 500
    for error)
    """
    try:
        try:
            seller_email = event['requestContext']['authorizer']['claims']['email']
            print('email', seller_email)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        #read input body
        request_body = json.loads(event['body'])
        auction_id = request_body.get('auction_id')
        reorder_lot_number = request_body.get('reorder_lot_number')
        reorder_position = request_body.get('reorder_position')

        #initialize mongo db
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]

        if not auction_id or not reorder_lot_number or not reorder_position or not seller_email:
            return (400, {"message": "auction_id reorder_lot_number and reorder_position are required for reordering a lot."})
        lot_to_be_reordered = list(lot_collection.find(
            {"seller_email": seller_email, "auction_id": auction_id, "lot_number": int(reorder_lot_number)}))

        if len(lot_to_be_reordered) != 1:
            return (400, {"message": "Lot number is not valid to re-order."})

        lot_collection.delete_one({"seller_email": seller_email, "auction_id": auction_id, "lot_number": int(reorder_lot_number)})

        if reorder_lot_number > reorder_position:
            #move lot upwards
            lots_to_update = lot_collection.find({"seller_email": seller_email, "auction_id": auction_id, "lot_number": {"$gte": int(reorder_position)}})

            lots_updated = []
            for lot in lots_to_update:
                lot_collection.delete_one(
                     {"auction_id": lot['auction_id'], "seller_email": lot["seller_email"], "lot_number":lot["lot_number"]})
                lot['lot_number'] = lot['lot_number']+1
                del lot["_id"]
                lots_updated.append(lot)
                lot_collection.insert_one(lot)

            lot_to_be_reordered[0]["lot_number"] = int(reorder_position)
            del lot_to_be_reordered[0]['_id']
            lot_collection.insert_one(lot_to_be_reordered[0])

        else:
            #lot moving down
            lots_to_update = lot_collection.find({"seller_email": seller_email, "auction_id": auction_id, "lot_number": {"$gte": int(reorder_lot_number)}})

            lots_updated = []
            for lot in lots_to_update:
                lot_collection.delete_one(
                     {"auction_id": lot['auction_id'], "seller_email": lot["seller_email"], "lot_number":lot["lot_number"]})
                lot['lot_number'] = lot['lot_number']-1
                del lot["_id"]
                lots_updated.append(lot)
                lot_collection.insert_one(lot)

            lot_to_be_reordered[0]["lot_number"] = int(reorder_position)
            del lot_to_be_reordered[0]['_id']
            lot_collection.insert_one(lot_to_be_reordered[0])
        client.close()
        return (204, {}) #update successful
    except Exception as err:
        return {
            "headers": headers,
            "statusCode": 500,
            "body": json.dumps({"message": "There was an error "})
        }

def lambda_handler(event, context):
    """
    The lambda_handler function is a Python function that handles incoming JSON requests,
    updates a lot based on the request body, and returns a response with the appropriate status
    code and response body.

    :param event:
    The `event` parameter is a dictionary that contains information about the event that
    triggered the Lambda function. It typically includes details such as the HTTP request headers,
    request body, and other metadata
    :param context: T
    he `context` parameter in the `lambda_handler` function is an object that provides
    information about the runtime environment of the Lambda function.
    It includes properties such as the
    AWS request ID, function name, function version, and more. The `context` object is automatically
    passed to the Lambda function by the
    :return: The lambda_handler function is returning a dictionary with three keys: "statusCode",
    "headers", and "body". The value of "statusCode" is the status code of the response,
    the value of "headers" is a dictionary of headers for the response,
    and the value of "body" is a JSON string representing the response body.
    """
    try:
        # Parse the incoming JSON request
        status_code, response_body = reorder_lots(event)
        return {
            "statusCode": status_code,
            "headers": headers,
            "body": json.dumps(response_body)
        }
    except Exception as e:
        print(e)
        print(e.with_traceback)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "Internal server error"})
        }
