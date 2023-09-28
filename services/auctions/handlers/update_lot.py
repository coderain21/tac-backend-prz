"""this library is used to import env's in the update_lot function """
import os
import json
import pymongo

# CORS headers
headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def update_lot(event):
    """
    The `update_lot` function updates the details of a lot in a collection based
    on the provided request body.
    :param request_body: The `request_body` parameter is a dictionary that contains
    the data sent in the request body. It is expected to have the following keys:
    :return: a tuple containing the status code and a dictionary message.
    The status code indicates the success or failure of the lot update operation,
    and the message provides
    additional information about the result.
    """
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
    # Initialize the MongoDB client
    client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
    db = client[os.environ['DATABASE']]
    collection = db[os.environ["LOT_COLLECTION_NAME"]]
    lot_number = request_body.get('lot_number')
    auction_id = request_body.get('auction_id')

    if not lot_number or not seller_email:
        return (400, {"message": "auction_id lot_number and seller_email are required for lot update."})

    update_data = {
        "title1": request_body.get('title1', ''),
        "title2": request_body.get('title2', ''),
        "description": request_body.get('description', ''),
        "starting_price": request_body.get('starting_price', 0),
        "low_estimate": request_body.get('low_estimate', 0),
        "high_estimate": request_body.get('high_estimate', 0),
        "shipping_details": request_body.get('shipping_details', ''),
        "tags": request_body.get('tags', []),
        "images": request_body.get('images', []),
    }

    collection.update_one(
        {"lot_number": lot_number, "seller_email": seller_email,
            "auction_id": auction_id},
        {"$set": update_data}
    )
    client.close()
    return (204, {})


def update(event, context):
    """
    The update function is a Python function that handles incoming JSON requests,
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
        status_code, response_body = update_lot(event)
        return {
            "statusCode": status_code,
            "headers": headers,
            "body": json.dumps(response_body)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "Internal server error"})
        }
