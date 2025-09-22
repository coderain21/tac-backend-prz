"""This module is used to bulk reorder lots"""
import json
import os
from pymongo import MongoClient

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def bulk_reorder_lots(event):
    """
    The `bulk_reorder_lots` accepts auction id and an array of lot reorder instructions.
    This is more efficient than individual reorders and ensures data consistency.

    :param auction_id: The auction_id for which the lots have to be reordered.
    :param lot_orders: Array of {lot_id, old_lot_number, new_lot_number} objects

    :return: a JSON response with the following properties:
    - "statusCode": The HTTP status code of the response (200 for success, 403 for access denied, 500 for error)
    """
    try:
        try:
            seller_email = event['requestContext']['authorizer']['claims']['email']
            print('email', seller_email)
        except:
            return {
                "statusCode": 403,
                "headers": headers,
                "body": json.dumps({"message": "You do not have access to perform this API action"})
            }

        # Read input body
        request_body = json.loads(event['body'])
        auction_id = request_body.get('auction_id')
        lot_orders = request_body.get('lot_orders', [])

        # Initialize mongo db
        client = MongoClient(
            os.environ['MONGO_CLIENT'],
            maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
        )
        db = client[os.environ['DATABASE']]
        lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]

        if not auction_id or not lot_orders or not seller_email:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "auction_id and lot_orders are required for reordering lots."})
            }

        # Validate that all lots belong to the seller and auction
        lot_ids = [order['lot_id'] for order in lot_orders]
        existing_lots = list(lot_collection.find({
            "seller_email": seller_email,
            "auction_id": auction_id,
            "_id": {"$in": lot_ids}
        }))

        if len(existing_lots) != len(lot_orders):
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Some lots are not valid for reordering."})
            }

        # Check for auction status (should be in draft)
        auction_collection = db[os.environ.get("AUCTION_COLLECTION_NAME", "auctions")]
        auction = auction_collection.find_one({
            "auction_id": auction_id,
            "seller_email": seller_email
        })

        if not auction or auction.get('status') != 'Draft':
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"message": "Auction must be in draft state to reorder lots."})
            }

        # Start bulk update operation
        bulk_operations = []
        
        for order in lot_orders:
            lot_id = order['lot_id']
            new_lot_number = order['new_lot_number']
            
            # Update the lot with new lot_number
            bulk_operations.append({
                "updateOne": {
                    "filter": {
                        "_id": lot_id,
                        "seller_email": seller_email,
                        "auction_id": auction_id
                    },
                    "update": {
                        "$set": {"lot_number": int(new_lot_number)}
                    }
                }
            })

        # Execute all updates in a single bulk operation for consistency
        if bulk_operations:
            result = lot_collection.bulk_write(bulk_operations)
            print(f"Updated {result.modified_count} lots")

        client.close()
        
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({
                "message": "Lots successfully reordered",
                "updated_count": len(bulk_operations)
            })
        }

    except Exception as err:
        print(f"Error in bulk_reorder_lots: {str(err)}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "There was an error reordering the lots"})
        }

def lambda_handler(event, context):
    """
    The lambda_handler function handles bulk lot reordering requests.
    """
    try:
        # Check HTTP method
        if event.get('httpMethod') == 'POST':
            status_code, response_body = bulk_reorder_lots(event)
            
            # Handle tuple return from bulk_reorder_lots
            if isinstance(status_code, tuple):
                actual_status, actual_body = status_code
                return {
                    "statusCode": actual_status,
                    "headers": headers,
                    "body": json.dumps(actual_body)
                }
            else:
                # Handle dict return (new format)
                return response_body
        else:
            return {
                "statusCode": 405,
                "headers": headers,
                "body": json.dumps({"message": "Method not allowed"})
            }
            
    except Exception as e:
        print(f"Lambda handler error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"message": "Internal server error"})
        }