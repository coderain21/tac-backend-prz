import json
import hmac
import hashlib
import os
import pymongo
secret_key = os.environ['SECRET_KEY']


def kyc_webhook(event, context):
    try:
        print("event",event)
        # Retrieve the event data from the request
        headers = event['headers']
        
        signature = headers.get('X-Sumsub-Signature')
        
        data = json.loads(event['body'])
        # Verify the Sumsub signature
        # expected_signature = hmac.new(secret_key.encode(), event['body'].encode(), hashlib.sha256).hexdigest()

        # if not hmac.compare_digest(signature, expected_signature):
        #     print('Invalid signature. Possible tampering.')
        #     return {
        #         'statusCode': 403,
        #         'body': json.dumps({'message': 'Invalid signature'})
        #     }
        applicant_id = data["applicantId"]
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection = db[os.environ['USER_TABLE']]

        user = collection.find_one({'applicantId':applicant_id})

        # Handle different webhook events
         
        event_type = data['type']
        user["type"] = event_type
        user["reviewStatus"] = data["reviewStatus"]

        if event_type == 'applicantCreated':
            # Logic for applicant creation event
            pass
        elif event_type == 'applicant.pending':
            # Logic for applicant pending event
            pass
        elif event_type == 'applicant.reviewed':
            # Logic for applicant reviewed event
            pass
        elif event_type == 'applicant.accepted':
            # Logic for applicant accepted event
            pass
        elif event_type == 'applicant.declined':
            # Logic for applicant declined event
            pass
        else:
            # Unknown event type
            pass
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
