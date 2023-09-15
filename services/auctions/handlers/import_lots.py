import os
import csv
import json
import requests
from io import StringIO
from pymongo import MongoClient
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

    """
    try:
        try:
            email_address = event['requestContext']['authorizer']['claims']['email']
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
        plan_type = user_info.get("plan_type")
        if plan_type == "Free":
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Upgrade the plan to Import lots"})
            }

        print("plan_type",plan_type)

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

        additional_fields = {
            "auction_id" : auction_id,
            "seller_email": email_address,
            "starting_bid": 0,
            "current_bid": 0,
            "Top_bidder": "",
            "images": []
        }

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
        auction_record = auction_collection.find_one({"auction_id" : auction_id,"seller_email": email_address},{"_id":0})
        if auction_record is None:
            return {
            "statusCode": 404,
            'headers': headers,
            "body": json.dumps({"message": "Auction doesn't exists."})
            }
        print("existing_lots_count",existing_lots_count)
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
        print(counter_record)
        last_lot_number = counter_record["starting_sequence"]
        print("last_lot_number",last_lot_number)
        try:
            for row in csv_reader:
                dict1 = {}
                if row['Lot Title 1'] == "" or row['Description'] == "" or row['Starting Price'] == "" or row['Tags'] == "":
                    return {
                        "statusCode": 400,
                        'headers': headers,
                        "body": json.dumps({"message": "Missing mandatory fields."})
                        }
                
                dict1["title1"] = row['Lot Title 1']
                dict1["title2"] = row['Title 2(Optional)']
                dict1["description"] = row['Description']
                dict1["starting_price"] = int(row.get('Starting Price'))
                dict1["low_estimate"] = int(row.get('Low Estimate',0))
                dict1["high_estimate"] = int(row.get('High Estimate',0))
                dict1["shipping_details"] = row['Product Shipping Location']
                dict1["tags"] = row['Tags']
             
                dict1.update(additional_fields)
                last_lot_number+=1
                dict1["lot_number"] = last_lot_number
                documents.append(dict1)
        except Exception as err:
            print(err)
            return {
                        "statusCode": 400,
                        'headers': headers,
                        "body": json.dumps({"message": "Invalid data detected in CSV."})
                    }
       
        # Insert the documents in bulk
        result = collection.insert_many(documents)

        update_data = {
            "starting_sequence": last_lot_number
        }
        
        print("latest lot number",last_lot_number)
        counter_collection.update_one({"auction_id": auction_id,
                                        "seller_email": email_address,
                                        "record_type": "Lots"}, {
                              "$set": update_data})
        client.close()

        return {
            "statusCode": 201,
            'headers': headers,
            "body": json.dumps({"message": "Lots imported successfully."})
        }
    except Exception as e:
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"error": str(e)})
        }
