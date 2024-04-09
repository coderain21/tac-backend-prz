"""
The `import_lots` function imports lots from a CSV file into a MongoDB database, with additional
validation and checks.
"""
import os
import csv
import json
import requests
from io import StringIO
from pymongo import MongoClient
from pymongo.errors import BulkWriteError
from lib.get import get_by_email

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def import_lots(event, context):
    """
    Import lots from a CSV file into a MongoDB database.

    Parameters:
    - event (dict): An AWS Lambda event containing the API Gateway request.
    - context (object): An AWS Lambda context object.

    Returns:
    - dict: A dictionary containing the HTTP response to be returned to the client.

    This function handles the import of lots from a CSV file into a MongoDB database.
    It requires the following input data in the event:
    - 'auction_id': The ID of the auction where lots will be imported.
    - 'csv_url': The URL to the CSV file containing lot information.

    The function performs the following steps:
    1. Verifies the user's authorization based on the 'email' claim in the request context.
    2. Validates the presence of required input fields ('auction_id' and 'csv_url').
    3. Checks the user's plan type; if it's 'Free', the import is not allowed.
    4. Fetches expected headers for the CSV file and checks if they match the actual headers.
    5. Retrieves information about the existing lots and the specified auction.
    6. Retrieves or initializes a counter for lot numbering.
    7. Parses the CSV data, validates it, and builds a list of lot documents.
    8. Performs plan-specific limitations; for 'Starter' plans, checks the lot limit.
    9. Inserts the lot documents into the MongoDB database.
    10. Updates the lot numbering counter.
    11. Closes the MongoDB client.
    12. Returns an HTTP response indicating the success or failure of the import operation.

    HTTP Responses:
    - 201 Created: Lots were imported successfully.
    - 400 Bad Request: Various error conditions are handled with appropriate error messages.
    - 403 Forbidden: Unauthorized access is denied.
    - 404 Not Found: When the specified auction doesn't exist.
    - 500 Internal Server Error: For unexpected errors.

    Note: This function assumes that necessary libraries and environment variables are properly configured.
    """
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
                return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }
            print('email', email_address)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        data = json.loads(event['body'])
        auction_id = data.get("auction_id")
        csv_url = data.get("csv_url")

        expected_fields = ["auction_id", "csv_url"]
        fields_not_found = list(set(expected_fields).difference(data.keys()))
        if fields_not_found:
            return {"headers": headers,
                    'statusCode': 400,
                    "body": json.dumps(
                        {"message": f"Please provide {','.join(fields_not_found)}"})
                    }

        collection = os.environ['SELLERS_TABLE']
        user_info = get_by_email(
            email_address, collection)
        print(user_info)
        plan_type = user_info.get("plan_type")
        free_user = user_info.get("free_user")
        if plan_type == "Free" or free_user == True:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Upgrade the plan to Import lots"})
            }

        print("plan_type", plan_type)

        # Expected column headers as set
        expected_headers = [
            'Lot Title 1',
            'Title 2(Optional)',
            'Description',
            'Starting Price',
            'Low Estimate',
            'High Estimate',
            'Product Shipping Location',
            'Tags'
        ]
        # Initialize the MongoDB client
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]

        collection = db[os.environ["LOT_COLLECTION_NAME"]]
        counter_collection = db[os.environ["COUNTER_LOT"]]
        auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]

        response = requests.get(csv_url)
        response.raise_for_status()
        # Decode the content as UTF-8 and create a StringIO buffer
        csv_data = response.content.decode('utf-8')
        csv_buffer = StringIO(csv_data)
        # Parse the CSV data
        csv_reader = csv.DictReader(csv_buffer)
        if csv_reader.fieldnames != expected_headers:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "CSV headers do not match the expected headers."})
            }
        documents = []
        existing_lots_count = collection.count_documents(
            {"seller_email": email_address, "auction_id": data["auction_id"]})
        auction_record = auction_collection.find_one(
            {"auction_id": auction_id, "seller_email": email_address}, {"_id": 0})
        if auction_record is None:
            return {
                "statusCode": 404,
                'headers': headers,
                "body": json.dumps({"message": "Auction doesn't exists."})
            }
        start_date=auction_record['start_date']
        end_date= auction_record['end_date']
        print(123,auction_record)
        print(3333, start_date, end_date)
        additional_fields = {
            "auction_id": auction_id,
            "seller_email": email_address,
            "starting_bid": 0,
            "current_bid": 0,
            "Top_bidder": "",
            "images": []
        }
        print("existing_lots_count", existing_lots_count)
        # Get the next lot number for the seller
        counter_record = counter_collection.find_one({"auction_id": auction_id,
                                                      "seller_email": email_address,
                                                      'record_type': 'Lots'}
                                                     )
        if counter_record is None:
            last_lot_number = 0
            counter_record = {
                "auction_id": auction_id,
                "seller_email": email_address,
                "record_type": "Lots",
                "starting_sequence": last_lot_number
            }
            result = counter_collection.insert_one(counter_record)
        extension_time_str = auction_record.get('extension_time_between_lots', '0')
        if extension_time_str != '':
            extension_time = int(extension_time_str[:1])
        else:
            extension_time=0
        print(counter_record)
        last_lot_number = counter_record["starting_sequence"]
        print("last_lot_number", last_lot_number)
        try:
            count_import=0
            print(csv_reader)
            for row in csv_reader:
                dict1 = {}
                if end_date is not None:
                    if auction_record['extension_type'] in ["Cascade","Individual Lots"]:
                        dict1['start_date'] = start_date
                        dict1['end_date'] = end_date + (existing_lots_count + count_import)* extension_time*60*1000
                        count_import= count_import+1
                    elif auction_record['extension_type']== "All Lots":
                        dict1['start_date'] = start_date
                        dict1['end_date'] = end_date
                else:
                    dict1['start_date'] = start_date
                    dict1['end_date'] = end_date

                if row['Lot Title 1'] == "" or row['Description'] == "" or row['Starting Price'] == "" or row['Tags'] == "":
                    return {
                        "statusCode": 400,
                        'headers': headers,
                        "body": json.dumps({"message": "Missing mandatory fields."})
                    }
                # Split tags and check if there are more than 3
                tags = [tag.strip() for tag in row['Tags'].split(',')]

                if len(tags) > 3:
                    return {
                        "statusCode": 400,
                        'headers': headers,
                        "body": json.dumps({"message": "Too many tags. Maximum allowed is 3."})
                }
                # Parse and check low and high estimates
                starting_price = int(row.get('Starting Price'))
                low_estimate = 0 if row.get('Low Estimate')=='' else int(row.get('Low Estimate',0))
                high_estimate = 0 if row.get('High Estimate') == '' else int(row.get('High Estimate', 0))

                if low_estimate > high_estimate:
                    return {
                        "statusCode": 400,
                        'headers': headers,
                        "body": json.dumps({"message": "Low Estimate cannot be greater than High Estimate."})
                    }
                
                dict1["title1"] = row['Lot Title 1']
                dict1["title2"] = row['Title 2(Optional)']
                dict1["description"] = row['Description']
                dict1["starting_price"] = starting_price
                dict1["low_estimate"] = low_estimate
                dict1["high_estimate"] = high_estimate
                dict1["shipping_details"] = row['Product Shipping Location']
                dict1["tags"] = tags
                dict1.update(additional_fields)
                last_lot_number += 1
                dict1["lot_number"] = last_lot_number
                if email_address == "anusha.k+stripeconnect@7edge.com":
                    static_image_url = "DomainName/Auctions/lots/images/000c0a2b-a20e-f6bb-0ad0-19969991696b/spring-maidenhair-trees.jpg"
                    static_image_data = {"url": static_image_url, "featured": True}
                    dict1['images'].append(static_image_data)
                documents.append(dict1)
        except Exception as err:
            print(err)
            return {
                "statusCode": 400,
                'headers': headers,
                "body": json.dumps({"message": "Invalid data detected in CSV."})
            }
        if plan_type == "Starter" and (existing_lots_count+len(documents)) > 500:
            return {
                "statusCode": 400,
                'headers': headers,
                "body": json.dumps({"message": "Upgrade the plan to import more lots"})
            }
        # Insert the documents in bulk
        try:
            result = collection.insert_many(documents)
        except BulkWriteError as bwe:
            write_errors = bwe.details.get('writeErrors', [])
            error_messages = [error.get('errmsg', 'Unknown error') for error in write_errors]
            return {
                "statusCode": 400,
                'headers': headers,
                "body": json.dumps({"message": "Bulk write error occurred", "details": error_messages})
            }

        update_data = {
            "starting_sequence": last_lot_number
        }

        print("latest lot number", last_lot_number)
        counter_collection.update_one({"auction_id": auction_id,
                                       "seller_email": email_address,
                                       "record_type": "Lots"}, {
            "$set": update_data})
        if result.inserted_ids:
            auction_record = auction_collection.find_one({"auction_id": auction_id, "seller_email": email_address})

            if auction_record and "total_lots" in auction_record and auction_record["total_lots"] >= 0:
                # Increment the existing "total_lots" count
                auction_collection.update_one(
                    {"auction_id": auction_id, "seller_email": email_address},
                    {"$inc": {"total_lots": len(result.inserted_ids)}}
                )
            else:
                # Calculate the total lots count (if not already calculated) and update the auction record
                total_lots_count = collection.count_documents({"seller_email": email_address, "auction_id": auction_id})
                auction_collection.update_one(
                    {"auction_id": auction_id, "seller_email": email_address},
                    {"$set": {"total_lots": total_lots_count}}
                )

            client.close()
            return {
                "statusCode": 201,
                'headers': headers,
                "body": json.dumps({"message": "Lots imported successfully."})
            }
        else:
            return {
                "statusCode": 400,
                'headers': headers,
                "body": json.dumps({"message": "No lots were imported."})
            }
    except Exception as e:
        print(e)
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"message": "There was an error while importing"})
        }