'''This api will unpublish/cancel an auction'''
import json
import pymongo
from bson.objectid import ObjectId
import os
import boto3

# Initialize MongoDB client and collections
client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db[os.environ['AUCTION_MONGODB_COLLECTION_NAME']]
StepFunctionArn = db[os.environ['STEP_FUNCTION_COLLECTION']]

# Initialize AWS Step Functions client
step_functions = boto3.client('stepfunctions')

# Lambda handler function
def handler(event, context):
    try:
        # Parse event body
        request_body = json.loads(event['body'])
        seller_email = request_body.get('seller_email')
        auction_id = event['queryStringParameters']['auction_id']
        # Query Auction collection to fetch auction details and StepFunctionArn collection to fetch all ARNs
        auction_details = collection.find_one({"seller_email": seller_email, "auction_id": auction_id})
        print('######################')
        all_arns = list(StepFunctionArn.find({"seller_email": seller_email, "auction_id": auction_id}))

        if auction_details:
            if request_body['type'] == 'UNPUBLISH' and auction_details.get('status') == 'Published':
                # Update auction status to 'Draft' and stop all related executions
                collection.update_one({"_id": auction_details['_id']}, {"$set": {"status": "Draft"}})
                stop_executions([item['arn'] for item in all_arns])

                return {
                    "statusCode": 204,
                    "headers": {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    "body": json.dumps({"message": "Successfully Updated"})
                }

            if request_body['type'] == 'CANCEL' and auction_details.get('status') == 'Accepting bids':
                # Update auction status to 'Cancelled' and stop all related executions
                collection.update_one({"_id": ObjectId(auction_details['_id'])}, {"$set": {"status": "Cancelled"}})
                stop_executions([item['arn'] for item in all_arns])

                return {
                    "statusCode": 204,
                    "headers": {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    "body": json.dumps({"message": "Successfully Updated"})
                }

            return {
                "statusCode": 400,
                "headers": {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                "body": json.dumps({
                    "message": "Update Error | Auction status not in the Published state" if request_body['type'] == 'UNPUBLISH' else "Update Error | Auction status not in the Accepting Bids state"
                })
            }
        else:
            return {
                "statusCode": 404,
                "headers": {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                "body": json.dumps({"message": "Auction not found"})
            }
    except Exception as e:
        print(e)
        return {
            "statusCode": 500,
            "headers": {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            "body": json.dumps({"message": "Internal Server Error"})
        }

def stop_executions(execution_arns):
    try:
        # Stop all executions in batch
        for arn in execution_arns:
            response = step_functions.stop_execution(executionArn=arn, cause='User initiated stop')
            print('Execution stopped successfully:')
    except Exception as e:
        print('Error stopping executions:', e)
