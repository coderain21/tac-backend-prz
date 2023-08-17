import json
import hmac
import hashlib
import os
from pymongo import MongoClient


def kyb_webhook(event, context):
        try:
            body= event['body']
            print('*************************',body['level_name'])
            if body['level_name']=='basic_kyc_level':
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
                    applicant_id = data["applicantId"]

                    client = MongoClient(os.environ['MONGO_CLIENT'])
                    db = client[os.environ['DATABASE']]
                    collection = db[os.environ['SELLERS_TABLE']]

                    user = collection.find_one({'applicantId': applicant_id})
                    print(user)
                    # Handle different webhook events
                    event_type = data['type']
                    print(event_type)
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
                except Exception as err:
                    print(err)
                    return {
                        "headers": headers,
                        "statusCode": 500,
                        "body": json.dumps({"message": "There was an error while generating token"})
                    }

            elif body['level_name']=='basic_kyb_level':
                    try:
                        # email_address = event['requestContext']['authorizer']['claims']['email']
                        email_address = "namratha.shettigar@7edge.com"
                        print('email',email_address)
                    except:
                        return {
                            "headers": headers,
                            "statusCode": 403,
                            "body": json.dumps({"message": "You do not have access to perform this API action"})
                        }

                    level_name = os.environ['KYB_LEVEL_NAME']
                    print('leve', level_name)
                    client = MongoClient(os.environ['MONGO_CLIENT'])
                    db = client[os.environ['DATABASE']]
                    collection_sellers = db[os.environ["SELLERS_TABLE"]]

                    user_info = collection_sellers.find_one({'email_address': email_address},{'password':0})
                    print('user', user_info)

                    if "kyb_reviewResult" in user_info and "kyb_reviewAnswer" in user_info["kyb_reviewResult"] and user_info["kyb_reviewResult"]["kyb_reviewAnswer"]=="RED":
                        del user_info["kyb_external_user_id"]
                        del user_info["companyId"]
                        del user_info["kyb_reviewResult"]

                    if not "companyId" in user_info and not "kyb_external_user_id" in user_info:
                        kyb_external_user_id = str(uuid.uuid4())
                        company_id = create_applicant('company',kyb_external_user_id,level_name)
                        user_info["kyb_external_user_id"] = kyb_external_user_id
                        user_info["companyId"] = company_id
                        # Update the user_activity document
                        collection_sellers.update_one({"_id": user_info["_id"]}, {
                                        "$set": user_info})
                    else:
                        kyb_external_user_id = user_info["kyb_external_user_id"]


                    token=get_access_token(kyb_external_user_id, level_name)
                    return {
                        "headers": headers,
                        'statusCode': 200,
                        'body': json.dumps({
                            'token': token
                        },
                            cls=Encoder)
                    }


        except Exception as err:
                print(err)
                return {
                    "headers": headers,
                    "statusCode": 500,
                    "body": json.dumps({"message": "There was an error while generating token"})
                }
