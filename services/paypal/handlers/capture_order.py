'''
This function is used to capture the payment for an existing PayPal order.'''
import os
import json
import requests
from lib.paypal_helper import get_paypal_access_token
from pymongo import MongoClient


PAYPAL_API_URL = os.environ.get("PAYPAL_URL")
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
order_collection = db[os.environ['ORDERS_COLLECTION']]
temp_orders_collection = db[os.environ['TEMP_ORDERS_COLLECTION']]
cart_collection = db[os.environ['CART_COLLECTION']]




HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

def capture_order(event, context):
    """Capture the payment for an existing PayPal order."""
    try:
        email_address = event['requestContext']['authorizer']['claims']['cognito:username']
        print('email', email_address)
    except:
        print('here in second')
        return {
            "statusCode": 403,
            "headers": HEADERS,
            "body": json.dumps({"message": "You do not have access to perform this API action"})
        }
    try:
        # Retrieve the order ID from the event
        order_id = event.get('queryStringParameters', {}).get('order_id')
        if not order_id:
            raise ValueError("Order ID is missing in the request parameters.")
        
        # Fetch access token
        access_token = get_paypal_access_token()
        if not access_token:
            raise Exception("Failed to retrieve PayPal access token.")
        
        # Prepare headers for PayPal request
        paypal_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}"
        }
        
        # Step 1: Check the status of the order
        order_details_response = requests.get(
            f"{PAYPAL_API_URL}/v2/checkout/orders/{order_id}",
            headers=paypal_headers
        )
        
        if order_details_response.status_code == 200:
            order_details = order_details_response.json()
            order_status = order_details.get("status")
            
            print("Order details:", order_details)
            
            if order_status == "COMPLETED":
                return {
                    "statusCode": 200,
                    "headers": HEADERS,
                    "body": json.dumps({
                        "message": "Order has already been completed",
                        "status": order_status
                    })
                }
            elif order_status != "APPROVED":
                return {
                    "statusCode": 400,
                    "headers": HEADERS,
                    "body": json.dumps({
                        "message": f"Order cannot be captured because its status is '{order_status}'.",
                        "status": order_status
                    })
                }
        else:
            # Handle error fetching order details
            error_response = order_details_response.json()
            error_message = error_response.get("message", "Unknown error")
            print(f"Failed to retrieve order details (status {order_details_response.status_code}):", error_response)
            return {
                "statusCode": order_details_response.status_code,
                "headers": HEADERS,
                "body": json.dumps({
                    "message": "Failed to retrieve order details",
                    "error": error_message,
                    "details": error_response
                })
            }
        
        # Step 2: Proceed with capturing the order if the status is "APPROVED"
        capture_response = requests.post(
            f"{PAYPAL_API_URL}/v2/checkout/orders/{order_id}/capture",
            headers=paypal_headers,
            json={}  # No body required for capture
        )
        
        # Handle response from PayPal
        if capture_response.status_code == 201:
            capture_details = capture_response.json()
            print("Order captured successfully:", capture_details)
            status = capture_details["status"]
            print('status', status)
            if status == "COMPLETED":
                order_data = temp_orders_collection.find_one({"payment_intent": order_id})
                print('temp', order_data)
                order_data['payment_status'] = 'Paid'
                order_collection.update_one({"payment_intent": order_id}, {"$set": order_data}, upsert=True)

                delete_cart = cart_collection.delete_many({
                    "email_address": order_data['email_address'],
                    "seller_email": order_data['seller_email'],
                    "auction_id": order_data['auction_id']
                })

                print(f"Deleted cart data: {delete_cart.deleted_count}")


            else:
                order_collection.update_one({"order_number": order_id}, {"$set": {"status": "Unpaid"}})

            return {
                "statusCode": 200,
                "headers": HEADERS,
                "body": json.dumps({
                    "message": "Order captured successfully",
                    "status": status
                })
            }
        else:
            # Log and handle various errors returned by PayPal
            error_response = capture_response.json()
            error_message = error_response.get("message", "Unknown error")
            print(f"Failed to capture order (status {capture_response.status_code}):", error_response)
            return {
                "statusCode": capture_response.status_code,
                "headers": HEADERS,
                "body": json.dumps({
                    "message": "Failed to capture order",
                    "error": error_message,
                    "details": error_response
                })
            }
    
    except ValueError as e:
        # Handle missing order ID or other ValueErrors
        print(f"Error: {str(e)}")
        return {
            "statusCode": 400,
            "headers": HEADERS,
            "body": json.dumps({"message": str(e)})
        }
    
    except Exception as e:
        # Catch any other exceptions
        print(f"Unexpected error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": HEADERS,
            "body": json.dumps({
                "message": "Internal server error"
            })
        }
