'''The `import os` statement is importing the `os` module in Python.'''
import os
import json
import pymongo


# Initialize the MongoDB client
client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db[os.environ["LOT_COLLECTION_NAME"]]
lot_collection= db[os.environ["COUNTER_LOT"]]

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
        request_body = json.loads(event['body'])
        seller_email = request_body["seller_email"]
        auction_id= request_body["auction_id"]

        # Check if the user_type is "Free"
        user_type = request_body.get('user_type', '')

        if user_type == 'Free':
            # Get the existing lot count for the seller
            existing_lots_count = collection.count_documents(
                            {"seller_email": seller_email,"auction_id":request_body["auction_id"]})

            # Check if the user has already added 10 lots
            if existing_lots_count >= 10:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"message": "Free users are limited to 10 lots."})
                }

        # Remove the "user_type" field from the request
        request_body.pop("user_type", None)


        # Get the next lot number for the seller
        counter = lot_collection.find_one_and_update({"auction_id": auction_id,
                                                      "seller_email": seller_email,
                                                      'record_type': 'Lots', 
                                                      'status': 'Active'}, 
                                                      {'$inc': {'starting_sequence': 1}},
                                                      return_document=pymongo.ReturnDocument.AFTER,
                                                      upsert=True)
        request_body["lot_number"]= str(counter["starting_sequence"])

        # Insert the lot data into the MongoDB collection
        collection.insert_one(request_body)

        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Lot added successfully."})
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }