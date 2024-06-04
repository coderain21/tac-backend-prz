'''This module is used to generate token for the KYC process'''
import json
import hmac
import hashlib
import os
from pymongo import MongoClient


def kyc_webhook(event, context):
    try:
        print("event", event)
        headers = event['headers']
        # Retrieve the secret key from environment variables
        secret_key = os.environ['SUMSUB_SECRET_KEY_WEBHOOK']

        # Retrieve the webhook payload and header values
        payload_bytes = event['body'].encode()
        payload_digest = headers.get('X-Payload-Digest')
        print(payload_digest)
        # Calculate HMAC-SHA1 digest
        calculated_digest = hmac.new(
            secret_key.encode(), payload_bytes, hashlib.sha1).hexdigest()

        # Compare calculated digest with header value
        if not hmac.compare_digest(calculated_digest, payload_digest):
            print('Invalid signature. Possible tampering.')
            return {
                'statusCode': 403,
                'body': json.dumps({'message': 'Invalid signature'})
            }
        print("valid signature")

        data = json.loads(event['body'])

        if data['levelName']=='basic-kyc-level':
            applicant_id = data["applicantId"]
            client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
            db = client[os.environ['DATABASE']]
            collection = db[os.environ['SELLERS_TABLE']]

            user = collection.find_one({'applicantId': applicant_id})
            if user is not None:
                # Handle different webhook events
                event_type = data['type']
                if event_type in ('applicantCreated', 'applicantPending', 'applicantWorkflowCompleted'):
                    user["kyc_event_type"] = event_type
                    user["kyc_status"] = data["reviewStatus"]

                else:
                    user["kyc_event_type"] = event_type
                    user["kyc_status"] = data["reviewStatus"]

                if "reviewResult" in data:
                    user['kyc_reviewResult'] = data["reviewResult"]

                collection.update_one({"_id": user["_id"]}, {
                    "$set": user})

                client.close()
                return {
                    'statusCode': 200,
                    'body': json.dumps({'message': 'Webhook event received and processed successfully'})
                }
            else:
                client.close()
                return {
                    'statusCode': 200,
                    'body': json.dumps({'message': 'Webhook event received and processed successfully'})
                }
        elif data['levelName']=='basic-kyb-level':
            print('entering kyb')
            company_id =  data["applicantId"]
            client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
            db = client[os.environ['DATABASE']]
            collection = db[os.environ['SELLERS_TABLE']]

            user = collection.find_one({'companyId': company_id})
            if user is not None:
                # Handle different webhook events
                event_type = data['type']
                print('event_type', event_type)
                if event_type in ('applicantCreated', 'applicantPending', 'applicantWorkflowCompleted'):
                    user["kyb_event_type"] = event_type
                    user["kyb_status"] = data["reviewStatus"]

                else:
                    user["kyb_event_type"] = event_type
                    user["kyb_status"] = data["reviewStatus"]

                if "reviewResult" in data:
                    user['kyb_reviewResult'] = data["reviewResult"]

                collection.update_one({"_id": user["_id"]}, {
                    "$set": user})

                client.close()
                return {
                    'statusCode': 200,
                    'body': json.dumps({'message': 'Webhook event received and processed successfully'})
                }
            else:
                client.close()
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
