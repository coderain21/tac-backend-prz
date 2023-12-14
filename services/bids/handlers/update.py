"""
Module: user_update_module

This module contains functions related to updating user information and adding users to Cognito groups.
"""
from pymongo import MongoClient
import json
import boto3
import os
from bson import ObjectId

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

cognito_client = boto3.client('cognito-idp', region_name=os.environ['REGION'])


def fetch_seller_email_from_auction(auction_id):
    """
    Fetch the seller's email from the auction collection in MongoDB.

    Args:
        auction_id (str): The unique identifier of the auction.

    Returns:
        str: The seller's email associated with the given auction_id or None if not found.
    """
    client = MongoClient(os.environ['MONGO_CLIENT'])
    db = client[os.environ['DATABASE']]
    auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
    email = auction_collection.find_one({"_id": ObjectId(auction_id)}, {
                                        'seller_email': 1}).get('seller_email')
    client.close()
    return email


def update_user(event, context):
    """
    Update user information and add the user to a Cognito group.

    Args:
        event (dict): The AWS Lambda event object containing details about the API Gateway request.
        context (object): The AWS Lambda context object.

    Returns:
        dict: A dictionary containing the API Gateway response.
    """
    try:
        try:
            print(event)
            cognito_data = json.loads(
                event['requestContext']['authorizer']['data'])
            print(cognito_data)
            email_address = cognito_data['email']
            if "cognito:groups" in cognito_data and not 'buyer' in cognito_data["cognito:groups"]:
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

        data = json.loads(event["body"])
        expected_fields = ["auction_id", "group"]
        fields_not_found = list(set(expected_fields).difference(data.keys()))
        if fields_not_found:
            return {"headers": headers,
                    'statusCode': 400,
                    "body": json.dumps(
                        {"message": f"Please provide {','.join(fields_not_found)}"})
                    }
        auction_id = data.get("auction_id")
        group = data.get("group")
        new = data.get("new",False)
        seller_email = fetch_seller_email_from_auction(auction_id)
        # Add user to the specified Cognito group
        cognito_client.admin_add_user_to_group(
            GroupName=group,
            UserPoolId=os.environ["DEFAULT_USERPOOL_ID"],
            Username=email_address
        )

        if seller_email is not None:
            buyer_data_to_add = {
                "user_type": "buyer",
                "password": "",
                "email_address": email_address,
                "newsletter_notification": False,
                "seller_email": seller_email,
                "terms_and_condition": True,
                "first_name": "",
                "last_name": ""
            }
            client = MongoClient(os.environ['MONGO_CLIENT'])
            db = client[os.environ['DATABASE']]
            buyer_collection = db[os.environ["BUYER_COLLECTION"]]

            # Check if the user already has a seller_email associated
            buyer_data = buyer_collection.find_one(
                {"email_address": email_address, "seller_email": seller_email})

            if buyer_data is None:
                if new is True:
                    print("new")
                    new_data = {
                        "user_type": "buyer",
                        "password": "",
                        "email_address": email_address,
                        "newsletter_notification": False,
                        "seller_email": seller_email,
                        "terms_and_condition": True,
                        "first_name": "",
                        "last_name": ""
                    }
                    buyer_data_new = buyer_collection.find_one(
                        {"email_address": email_address},{"_id":0,"seller_email":0})
                    print("-->",buyer_data_new)
                    if buyer_data_new is not None:
                        buyer_data_new["seller_email"]=seller_email
                        buyer_collection.insert_one(buyer_data_new)
                    else:
                        buyer_collection.insert_one(new_data)

                else:
                    # Check if the user has an existing record without seller_email
                    buyer_data_without_seller = buyer_collection.find_one(
                        {"email_address": email_address, "registered_through": "federated"})
                    print("-->", buyer_data_without_seller)
                    if buyer_data_without_seller is not None and "seller_email" not in buyer_data_without_seller:
                        buyer_collection.update_one({"_id": buyer_data_without_seller["_id"]}, {
                                                    '$set': {"seller_email": seller_email, "registered_through": ""}})

                    if buyer_data_without_seller == None:
                        buyer_collection.insert_one(buyer_data_to_add)

            client.close()
            return {
                "statusCode": 204,
                'headers': headers,
                "body": json.dumps({})
            }
        else:
            return {
                "statusCode": 404,
                'headers': headers,
                "body": json.dumps({"message": "User does not exist"})
            }
    except Exception as err:
        print(err)
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"message": "There was an error while adding to the group"})
        }
