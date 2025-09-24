"""
Module: delete

This module contains a Lambda function for deleting an auction. It connects to a MongoDB database
and allows sellers to delete auctions they own, changing their status to "Deleted". The function
verifies the seller's authorization and checks the auction's status before deletion.

Dependencies:
- pymongo: Python driver for MongoDB.
- lib.get.get_by_email: A function for retrieving seller information by email address.

Environment Variables:
- SELLERS_TABLE: The name of the table containing seller information.
- MONGO_CLIENT: The MongoDB client connection string.
- DATABASE: The name of the MongoDB database.
- AUCTION_MONGODB_COLLECTION_NAME: The name of the MongoDB collection for auctions.

"""
import os
import json
from pymongo import MongoClient
import boto3
from botocore.exceptions import ClientError
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}

client = MongoClient(
                      os.environ['MONGO_CLIENT'],
                      maxIdleTimeMS=60000  # Set maxIdleTimeMS to 60 seconds (60000 milliseconds)
                        )
db = client[os.environ['DATABASE']]
auctions_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
collection_seller = db[os.environ["SELLERS_TABLE"]]
lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]
# access_logs_collection= db[os.environ["ACCESS_LOGS_TABLE"]]

# Thread-safe S3 client creation
_local = threading.local()

def get_s3_client():
    """Get thread-local S3 client for concurrent operations"""
    if not hasattr(_local, 's3_client'):
        _local.s3_client = boto3.client('s3', region_name=os.environ.get('REGION', 'eu-west-2'))
    return _local.s3_client


def extract_s3_key_from_image(image_obj):
    """
    Extract S3 key from image object
    :param image_obj: The image object with url and featured properties
    :return: The validated S3 key or None if invalid
    """
    if not image_obj or not isinstance(image_obj, dict) or 'url' not in image_obj:
        return None

    url = image_obj.get('url')
    if not url or not isinstance(url, str) or url.strip() == '':
        return None

    return url.strip()


def delete_single_s3_object(s3_key, bucket_name, add_public_prefix=False):
    """
    Delete a single S3 object with error handling
    :param s3_key: The S3 key to delete
    :param bucket_name: S3 bucket name
    :param add_public_prefix: Whether to add 'public/' prefix
    :return: Tuple (success: bool, key: str, error: str)
    """
    try:
        s3_client = get_s3_client()

        # Add prefix if required (for lot images)
        full_key = f"public/{s3_key}" if add_public_prefix else s3_key

        # Check if object exists (optional, can be removed for performance)
        try:
            s3_client.head_object(Bucket=bucket_name, Key=full_key)
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                print(f'Object not found in S3: {full_key}')
                return True, full_key, None  # Consider missing as successfully deleted

        # Delete the object
        s3_client.delete_object(Bucket=bucket_name, Key=full_key)
        print(f'Successfully deleted S3 object: {full_key}')
        return True, full_key, None

    except ClientError as e:
        error_msg = f'Failed to delete S3 object {full_key}: {str(e)}'
        print(error_msg)
        return False, full_key, error_msg
    except Exception as e:
        error_msg = f'Unexpected error deleting S3 object {full_key}: {str(e)}'
        print(error_msg)
        return False, full_key, error_msg


def delete_images_from_s3_batch(images, max_workers=10):
    """
    Delete lot images from S3 using concurrent processing for better performance
    :param images: Array of image objects with url and featured properties
    :param max_workers: Maximum number of concurrent threads
    :return: Success status (True if all deleted successfully, False otherwise)
    """
    if not images or not isinstance(images, list) or len(images) == 0:
        print("No images to delete")
        return True

    print(f"Processing {len(images)} lot images for deletion with {max_workers} workers")

    try:
        bucket_name = os.environ.get('S3_BUCKET')
        if not bucket_name:
            print("S3_BUCKET environment variable not set")
            return False

        # Extract S3 keys from image objects
        s3_keys = []
        for i, image in enumerate(images):
            key = extract_s3_key_from_image(image)
            if key:
                s3_keys.append(key)
            else:
                print(f"Failed to extract key from image {i+1}: {image}")

        if len(s3_keys) == 0:
            print('No valid S3 keys found in images array')
            return True

        # Delete objects concurrently
        success_count = 0
        failed_keys = []

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all deletion tasks
            future_to_key = {
                executor.submit(delete_single_s3_object, key, bucket_name, True): key 
                for key in s3_keys
            }

            # Process completed tasks
            for future in as_completed(future_to_key):
                key = future_to_key[future]
                try:
                    success, full_key, error = future.result()
                    if success:
                        success_count += 1
                    else:
                        failed_keys.append(key)
                except Exception as e:
                    print(f'Exception in thread for key {key}: {str(e)}')
                    failed_keys.append(key)

        print(f'Successfully deleted {success_count}/{len(s3_keys)} lot images from S3')
        if failed_keys:
            print(f'Failed to delete keys: {failed_keys}')

        return len(failed_keys) == 0

    except Exception as e:
        print(f'Error in batch deletion of images from S3: {str(e)}')
        return False


def delete_images_from_s3(images):
    """
    Delete images from S3 - wrapper for backward compatibility
    :param images: Array of image objects with url and featured properties
    :return: Success status (True if all deleted successfully, False otherwise)
    """
    return delete_images_from_s3_batch(images)


def delete_auction_image_from_s3(auction_image_url):
    """
    Delete auction image from S3
    :param auction_image_url: The auction image URL like "DomainName/Auctions/images/725aa5d1-67c8-0538-0289-09f438be63a4/sea.jpg"
    :return: Success status
    """
    if not auction_image_url:
        print("No auction image URL provided")
        return True

    print(f"Processing auction image URL: {auction_image_url}")

    try:
        bucket_name = os.environ.get('S3_BUCKET')
        if not bucket_name:
            print("S3_BUCKET environment variable not set")
            return False

        # FIXED: Use the full auction_image_url as the S3 key (similar to lot images)
        # The auction image URL is already in the correct format: "DomainName/Auctions/images/..."
        # We just need to use it directly as the S3 key and add the public prefix
        s3_key = auction_image_url.strip()

        print(f"Using full URL as S3 key: {s3_key}")

        # FIXED: Use the single object deletion function WITH public prefix for auction images
        success, full_key, error = delete_single_s3_object(s3_key, bucket_name, True)

        if success:
            print(f'Successfully deleted auction image: {s3_key}')
        else:
            print(f'Failed to delete auction image: {error}')

        return success

    except Exception as e:
        print(f'Unexpected error deleting auction image: {str(e)}')
        return False


def extract_auction_image_key(auction_image_url):
    """
    Extract S3 key from auction image URL
    :param auction_image_url: Full auction image URL like "DomainName/Auctions/images/725aa5d1-67c8-0538-0289-09f438be63a4/sea.jpg"
    :return: The S3 key or None if invalid
    """
    if not auction_image_url or not isinstance(auction_image_url, str):
        return None

    # Extract the path after the domain
    if '/Auctions/images/' in auction_image_url:
        return auction_image_url.split('/Auctions/images/', 1)[1]
    return None


def delete_lots_batch(auction_id, seller_email, batch_size=100):
    """
    Delete lots and their images in batches for better performance
    :param auction_id: The auction ID
    :param seller_email: The seller's email
    :param batch_size: Number of lots to process per batch
    :return: Total number of lots and images deleted
    """
    print(f"Starting batch deletion of lots for auction {auction_id}")

    total_lots_deleted = 0
    total_images_deleted = 0
    batch_number = 0

    try:
        while True:
            batch_number += 1
            print(f"Processing batch {batch_number}")

            # Get next batch of lots
            lots = list(lot_collection.find(
                {"auction_id": auction_id, "seller_email": seller_email}, 
                {"_id": 0}
            ).limit(batch_size))

            if not lots:
                print("No more lots to process")
                break

            print(f"Found {len(lots)} lots in batch {batch_number}")

            # Collect all images from this batch
            batch_images = []
            for lot in lots:
                if 'images' in lot and lot['images']:
                    batch_images.extend(lot['images'])

            # Delete all images from this batch concurrently
            if batch_images:
                print(f"Deleting {len(batch_images)} images from batch {batch_number}")
                success = delete_images_from_s3_batch(batch_images, max_workers=15)
                if success:
                    total_images_deleted += len(batch_images)
                    print(f"Successfully deleted {len(batch_images)} images from batch {batch_number}")
                else:
                    print(f"Some images failed to delete in batch {batch_number}")

            # FIXED: Delete lots from database for this batch
            lot_ids = [lot.get('lot_id') for lot in lots if lot.get('lot_id')]
            print(f"Attempting to delete {len(lot_ids)} lots from database: {lot_ids}")

            if lot_ids:
                # Use the lot_ids to delete from database
                delete_result = lot_collection.delete_many({
                    "auction_id": auction_id, 
                    "seller_email": seller_email,
                    "lot_id": {"$in": lot_ids}
                })
                batch_deleted = delete_result.deleted_count
                total_lots_deleted += batch_deleted
                print(f'Deleted {batch_deleted} lots from database in batch {batch_number}')

                if batch_deleted != len(lot_ids):
                    print(f'Warning: Expected to delete {len(lot_ids)} lots but deleted {batch_deleted}')
            else:
                # Fallback: if no lot_ids, delete by auction_id and seller_email directly
                print("No lot_ids found, trying to delete by auction_id and seller_email")
                delete_result = lot_collection.delete_many({
                    "auction_id": auction_id, 
                    "seller_email": seller_email
                })
                batch_deleted = delete_result.deleted_count
                total_lots_deleted += batch_deleted
                print(f'Deleted {batch_deleted} lots from database using fallback method')

            # If we got fewer lots than batch_size, we're done
            if len(lots) < batch_size:
                break

    except Exception as e:
        print(f"Error in batch deletion: {str(e)}")
    
    print(f"Batch deletion completed. Total lots deleted: {total_lots_deleted}, Total images deleted: {total_images_deleted}")
    return total_lots_deleted, total_images_deleted


def delete_auction(event, context):
    """
    Delete an auction with the specified ID, provided the seller has the necessary authorization
    and the auction's status allows deletion.

    Args:
        event (dict): The input event data containing request parameters and context.
        context (object): Lambda function execution context.

    Returns:
        dict: A dictionary containing the API response including status code and body.
    """
    try:
        # Authorization check
        try:
            seller_email = event['requestContext']['authorizer']['claims']['email']
            if "cognito:groups" in event['requestContext']['authorizer']['claims'] and not 'seller' in event['requestContext']['authorizer']['claims']["cognito:groups"]:
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
        
        # Get the auction_id from the path parameter
        auction_id = event['pathParameters']['auction_id']
        print(f"Processing deletion for auction_id: {auction_id}, seller_email: {seller_email}")

        # Check if the auction with the given ID exists
        auction = auctions_collection.find_one(
            {'auction_id': auction_id, 'seller_email': seller_email}, {'_id': 0})

        if not auction:
            return {
                "headers": headers,
                'statusCode': 404,
                'body': json.dumps({"message": "Auction with associated auction_id doesn't exists"})
            }

        # Check if the status allows deletion
        current_status = auction.get('status')
        if current_status not in ['Draft', 'Published', 'Deleted']:
            return {
                "headers": headers,
                'statusCode': 400,
                'body': json.dumps({"message": 'You cannot delete the auction with the current status'})
            }

        print(f"Auction found with status: {current_status}. Proceeding with deletion...")

        # Delete lots and their images using batch processing
        total_lots_deleted, total_images_deleted = delete_lots_batch(auction_id, seller_email)
        print(f'Total deletion summary: {total_lots_deleted} lots, {total_images_deleted} images')

        # Delete auction image from S3
        if 'auction_image' in auction and auction['auction_image']:
            print(f"Deleting auction image: {auction['auction_image']}")
            auction_image_success = delete_auction_image_from_s3(auction['auction_image'])
            if auction_image_success:
                print("Auction image deleted successfully")
            else:
                print("Failed to delete auction image, but continuing with auction deletion")
        else:
            print("No auction image to delete")

        # Update the status to "Deleted"
        update_result = auctions_collection.update_one(
            {'auction_id': auction_id, 'seller_email': seller_email},
            {'$set': {'status': 'Deleted'}}
        )

        if update_result.modified_count == 1:
            print("Auction status updated to 'Deleted' successfully")
        else:
            print("Warning: Auction status update may have failed")

        # Access logs (commented as in original)
        seller_data = collection_seller.find_one({"email_address": seller_email}, {"_id": 0})
        # Get the current timestamp in seconds and convert to milliseconds
        # timestamp_ms = int(datetime.now().timestamp() * 1000)

        # Convert to float and format as a string with '.0'
        # formatted_timestamp = float(timestamp_ms)

        # access_logs = {
        #     "actor_id": seller_data.get('seller_id'),
        #     "updated_by": {
        #         "type": 'Seller',
        #         "name": seller_data.get('first_name') + ' ' + seller_data.get('last_name'),
        #         "email_address": seller_email,
        #     },
        #     "section": {
        #         "name": 'Auction Management',
        #         "action": 'Delete',
        #         "auction_id": auction_id,
        #     },
        #     "updated_at": formatted_timestamp
        # }
        # access_logs_collection.insert_one(access_logs)

        print(f"Auction deletion completed successfully for auction_id: {auction_id}")
        return {
            "headers": headers,
            'statusCode': 204,
            'body': json.dumps({})
        }

    except Exception as err:
        print(f"Critical error in delete_auction: {str(err)}")
        return {
            "statusCode": 500,
            'headers': headers,
            "body": json.dumps({"message": "There was an error while deleting the auction"})
        }