import json
import hmac
import hashlib
import os
import pymongo
from pymongo import MongoClient

def kyc_webhook(event, context):
    try:
        print("event", event)
        headers = event['headers']
        
        # Retrieve the secret key from environment variables
        secret_key = os.environ['SUMSUB_SECRET_KEY_WEBHOOK']
        
        # Retrieve the webhook payload and header values
        payload_bytes = event['body'].encode()
        payload_digest = headers.get('x-payload-digest')
        
        # Calculate HMAC-SHA1 digest
        calculated_digest = hmac.new(secret_key.encode(), payload_bytes, hashlib.sha1).hexdigest()
        
        # Compare calculated digest with header value
        if not hmac.compare_digest(calculated_digest, payload_digest):
            print('Invalid signature. Possible tampering.')
            return {
                'statusCode': 403,
                'body': json.dumps({'message': 'Invalid signature'})
            }
        
        data = json.loads(event['body'])
        applicant_id = data["applicantId"]
        \
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ['SELLERS_TABLE']]

        user = collection.find_one({'applicantId':applicant_id})

        # Handle different webhook events
        event_type = data['type']

        if event_type == 'applicantCreated' or event_type == 'applicantPending' or event_type == 'applicantWorkflowCompleted':   
            user["type"] = event_type
            user["reviewStatus"] = data["reviewStatus"]

        else:
            user["type"] = event_type
            user["reviewStatus"] = data["reviewStatus"]

        if "reviewResult" in data:
            user['reviewResult'] = data["reviewResult"] 

        collection.update_one({"_id": user["_id"]}, {
                                  "$set": user})
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Webhook event received and processed successfully'})
        }

    except Exception as e:
        # Handle errors or exceptions
        print('Error:', str(e))
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Internal Server Error'})
        }
