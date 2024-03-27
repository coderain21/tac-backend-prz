import json
import pymongo
from bson.objectid import ObjectId

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}



# Assume StepFunctions class and helpers.getHeaders() are implemented elsewhere in your Python environment.

# MongoDB connection
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
Auction = db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]
StepFunctionArn = db[os.environ['STEP_FUNCTION_COLLECTION']]

# Function to stop executions
def stop_executions(execution_arn):
    # Your implementation to stop Step Functions executions
    pass

# Lambda handler function
def unpublish_auction(event, context):
    try:
        # MongoDB connection setup
        print("MongoDB connected successfully")

        # Parse event body
        request_body = json.loads(event['body'])
        seller_email = request_body.get('seller_email')
        auction_id = event['queryStringParameters']['auction_id']
        
        # Query Auction collection
        get_auction_details = Auction.find_one({"seller_email": seller_email, "auction_id": auction_id})
        print('auction', get_auction_details)
        
        if request_body['type'] == 'UNPUBLISH' and get_auction_details['status'] == 'Published':
            # Update auction status to 'Draft'
            Auction.update_one({"_id": get_auction_details['_id']}, {"$set": {"status": "Draft"}})
            step_function_end = []
            # Query StepFunctionArn collection
            get_all_arns = StepFunctionArn.find({"seller_email": seller_email, "auction_id": auction_id})
            for item in get_all_arns:
                execution_arn = item['arn']
                step_function_end.append(stop_executions(execution_arn))
            # Wait for all executions to finish
            # Implement your logic here for waiting
            
            return {
                "statusCode": 204,
                "headers": headers,
                "body": json.dumps({"message": "Successfully Updated"})
            }
        
        if request_body['type'] == 'CANCEL' and get_auction_details['status'] == 'Accepting bids':
            # Update auction status to 'Cancelled'
            Auction.update_one({"_id": ObjectId(get_auction_details['_id'])}, {"$set": {"status": "Cancelled"}})
            step_function_end = []
            # Query StepFunctionArn collection
            get_all_arns = StepFunctionArn.find({"seller_email": seller_email, "auction_id": auction_id})
            for item in get_all_arns:
                execution_arn = item['arn']
                step_function_end.append(stop_executions(execution_arn))
            # Wait for all executions to finish
            # Implement your logic here for waiting
            
            return {
                "statusCode": 204,
                "headers": headers,
                "body": json.dumps({"message": "Successfully Updated"})
            }
        
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({
                "message": "Update Error | Auction status not in the Published state" if request_body['type'] == 'UNPUBLISH' else "Update Error | Auction status not in the Accepting Bids state"
            })
        }
    except Exception as e:
        print(e)
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "Internal Server Error"})
        }
