"""
Module: cleanup

This module contains a Lambda function for cleaning up auction assets (lots and images).
It is called asynchronously after an auction is marked as deleted to handle the cleanup
of associated lots and S3 images without blocking the main delete API response.

Dependencies:
- pymongo: Python driver for MongoDB.
- boto3: AWS SDK for S3 operations.

Environment Variables:
- MONGO_CLIENT: The MongoDB client connection string.
- DATABASE: The name of the MongoDB database.
- LOT_COLLECTION_NAME: The name of the MongoDB collection for lots.
- S3_BUCKET: The S3 bucket name for image storage.
- REGION: AWS region for S3 operations.
"""
import os
import json
from pymongo import MongoClient
import boto3
from botocore.exceptions import ClientError
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# Thread-safe S3 client creation
_local = threading.local()

def get_s3_client():
    """Get thread-local S3 client for concurrent operations"""
    if not hasattr(_local, 's3_client'):
        _local.s3_client = boto3.client('s3', region_name=os.environ.get('REGION', 'eu-west-2'))
    return _local.s3_client

# MongoDB connection
client = MongoClient(
    os.environ['MONGO_CLIENT'],
    maxIdleTimeMS=60000
)
db = client[os.environ['DATABASE']]
lot_collection = db[os.environ["LOT_COLLECTION_NAME"]]

def extract_s3_key_from_image(image_obj):
    """Extract S3 key from image object"""
    if not image_obj or not isinstance(image_obj, dict) or 'url' not in image_obj:
        return None

    url = image_obj.get('url')
    if not url or not isinstance(url, str) or url.strip() == '':
        return None

    return url.strip()

def delete_single_s3_object(s3_key, bucket_name, add_public_prefix=False):
    """Delete a single S3 object with error handling"""
    try:
        s3_client = get_s3_client()
        full_key = f"public/{s3_key}" if add_public_prefix else s3_key

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
    """Delete lot images from S3 using concurrent processing"""
    if not images or not isinstance(images, list) or len(images) == 0:
        return True

    print(f"Processing {len(images)} lot images for deletion")

    try:
        bucket_name = os.environ.get('S3_BUCKET')
        if not bucket_name:
            print("S3_BUCKET environment variable not set")
            return False

        # Extract S3 keys
        s3_keys = []
        for image in images:
            key = extract_s3_key_from_image(image)
            if key:
                s3_keys.append(key)

        if len(s3_keys) == 0:
            return True

        # Delete objects concurrently
        success_count = 0
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_key = {
                executor.submit(delete_single_s3_object, key, bucket_name, True): key
                for key in s3_keys
            }

            for future in as_completed(future_to_key):
                key = future_to_key[future]
                try:
                    success, full_key, error = future.result()
                    if success:
                        success_count += 1
                except Exception as e:
                    print(f'Exception in thread for key {key}: {str(e)}')

        print(f'Successfully deleted {success_count}/{len(s3_keys)} lot images')
        return success_count == len(s3_keys)

    except Exception as e:
        print(f'Error in batch deletion: {str(e)}')
        return False

def delete_auction_image_from_s3(auction_image_url):
    """Delete auction image from S3"""
    if not auction_image_url:
        return True

    try:
        bucket_name = os.environ.get('S3_BUCKET')
        s3_key = auction_image_url.strip()

        success, full_key, error = delete_single_s3_object(s3_key, bucket_name, True)

        if success:
            print(f'Successfully deleted auction image: {s3_key}')
        else:
            print(f'Failed to delete auction image: {error}')

        return success
    except Exception as e:
        print(f'Error deleting auction image: {str(e)}')
        return False

def delete_lots_batch(auction_id, seller_email, batch_size=100):
    """Delete lots and their images in batches"""
    print(f"Starting cleanup for auction {auction_id}")

    total_lots_deleted = 0
    total_images_deleted = 0
    batch_number = 0
    try:
        while True:
            batch_number += 1

            # Get next batch of lots (keep _id for deletion)
            lots = list(lot_collection.find(
                {"auction_id": auction_id, "seller_email": seller_email}
            ).limit(batch_size))

            if not lots:
                break

            print(f"Processing batch {batch_number} with {len(lots)} lots")

            # Collect and delete images
            batch_images = []
            for lot in lots:
                if 'images' in lot and lot['images']:
                    batch_images.extend(lot['images'])

            if batch_images:
                success = delete_images_from_s3_batch(batch_images, max_workers=15)
                if success:
                    total_images_deleted += len(batch_images)

            # Delete lots directly using auction_id and seller_email
            delete_result = lot_collection.delete_many({
                "auction_id": auction_id, 
                "seller_email": seller_email
            })
            total_lots_deleted += delete_result.deleted_count

            # If we deleted fewer than batch_size, we're done
            if delete_result.deleted_count < batch_size:
                break

    except Exception as e:
        print(f"Error in cleanup: {str(e)}")

    print(f"Cleanup completed. Lots deleted: {total_lots_deleted}, Images deleted: {total_images_deleted}")
    return total_lots_deleted, total_images_deleted




def cleanup_auction_assets(event, context):
    """
    Main cleanup function for auction assets
    
    Args:
        event (dict): Contains auction_id, seller_email, and auction_image
        context (object): Lambda function execution context
    
    Returns:
        dict: Status of cleanup operation
    """
    try:
        auction_id = event['auction_id']
        seller_email = event['seller_email']
        auction_image = event.get('auction_image')
        auction_logo_image = event.get('auction_logo_image')
        event_background_image = event.get('event_background_image')
        event_left_image = event.get('event_left_image')
        event_right_image = event.get('event_right_image')

        print(f"Starting cleanup for auction {auction_id}")

        # Delete lots and their images
        lots_deleted, images_deleted = delete_lots_batch(auction_id, seller_email)

        # Delete auction image
        auction_image_deleted = False
        if auction_image:
            auction_image_deleted = delete_auction_image_from_s3(auction_image)
        if auction_logo_image:
            auction_image_deleted = delete_auction_image_from_s3(auction_logo_image)
        if event_background_image:
            auction_image_deleted = delete_auction_image_from_s3(event_background_image)
        if event_left_image:
            auction_image_deleted = delete_auction_image_from_s3(event_left_image)
        if event_right_image:
            auction_image_deleted = delete_auction_image_from_s3(event_right_image)

        print(f"Cleanup completed for auction {auction_id}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'auction_id': auction_id,
                'lots_deleted': lots_deleted,
                'images_deleted': images_deleted,
                'auction_image_deleted': auction_image_deleted
            })
        }

    except Exception as e:
        print(f"Error in cleanup function: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }