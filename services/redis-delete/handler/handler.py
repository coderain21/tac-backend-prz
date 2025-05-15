'''This function is used to delete the data from redis using the keys stored in db using a schedule'''
import os
import json
import boto3
import redis as redis_py  # Redis module for exceptions
from rediscluster import RedisCluster  # For connecting to Redis Cluster
from pymongo import MongoClient, errors as pymongo_errors  # MongoDB client and error handling
from datetime import datetime, timedelta  # For time-based filtering
import traceback  # For detailed stack trace in case of errors

# Function to create and return a Redis Cluster client
def createRedisClient():
    try:
        # Define Redis cluster nodes
        startup_nodes = [
            {
                "host": os.environ["REDIS_CLUSTER_ENDPOINT"],
                "port": 6379  # Default Redis port
            }
        ]
        # Ensure the Redis endpoint environment variable is set
        if not os.environ.get("REDIS_CLUSTER_ENDPOINT"):
            raise ValueError("REDIS_CLUSTER_ENDPOINT environment variable not set.")

        # Create Redis cluster connection
        cluster = RedisCluster(
            startup_nodes=startup_nodes,
            decode_responses=True,  # Decode responses to string
            skip_full_coverage_check=True  # Skip coverage check for flexibility
        )
        print("Successfully connected to Redis Cluster.")
        return cluster
    except redis_py.exceptions.RedisClusterException as rce:
        print(f"Error connecting to Redis Cluster (RedisClusterException): {rce}")
        raise
    except Exception as e:
        print(f"Generic error connecting to Redis: {e}")
        raise

# Function to connect to MongoDB and return the relevant collection
def get_mongodb_collection():
    try:
        mongo_uri = os.environ.get("MONGO_CLIENT")
        db_name = os.environ.get("MONGODB_NAME")
        collection_name = os.environ.get("REDIS_KEYS_COLLECTION")

        # Validate MongoDB environment variables
        if not mongo_uri:
            raise ValueError("MONGO_URI environment variable not set.")
        if not db_name:
            raise ValueError("MONGO_DB_NAME environment variable not set.")

        client = MongoClient(mongo_uri)
        client.admin.command('ping')  # Test MongoDB connection
        db = client[db_name]
        print(f"Successfully connected to MongoDB. DB: {db_name}, Collection: {collection_name}")
        return db[collection_name]
    except pymongo_errors.ConnectionFailure as cf:
        print(f"MongoDB connection failed: {cf}")
        raise
    except Exception as e:
        print(f"Error getting MongoDB collection: {e}")
        raise

# Main function to delete old Redis keys based on data in MongoDB
def delete_old_redis_data(event, context):
    redis_cluster = None
    mongo_collection = None

    try:
        # Setup Redis and MongoDB connections
        redis_cluster = createRedisClient()
        mongo_collection = get_mongodb_collection()
    except Exception as setup_e:
        # Send SNS alert if setup fails
        print(f"Setup error (Redis or MongoDB connection): {setup_e}")
        sns_topic_arn_setup = os.environ.get('SNS_TOPIC_ARN')
        if sns_topic_arn_setup:
            try:
                sns_client = boto3.client('sns')
                error_message = {
                    'error_type': 'SetupError',
                    'error_message': str(setup_e),
                    'details': 'Failed during Redis or MongoDB connection setup.'
                }
                sns_client.publish(
                    TopicArn=sns_topic_arn_setup,
                    Message=json.dumps(error_message),
                    Subject='Redis Data Deletion Cron - SETUP ERROR'
                )
            except Exception as sns_e:
                print(f"Failed to send SNS error alert during setup: {sns_e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': f'Setup error: {str(setup_e)}'})
        }

    sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')
    deleted_redis_keys_count = 0
    processed_mongo_docs_ids = []  # Track MongoDB documents processed
    deleted_redis_keys = []  # Track Redis keys deleted

    try:
        # Determine cutoff datetime (10 days ago)
        cutoff_datetime = datetime.now() - timedelta(days=10)
        cutoff_timestamp_seconds = int(cutoff_datetime.timestamp())
        print(f"Cutoff timestamp: {cutoff_timestamp_seconds} ({cutoff_datetime.isoformat()})")

        # Find MongoDB documents older than cutoff timestamp
        old_docs_cursor = mongo_collection.find({"created_at": {"$lte": cutoff_timestamp_seconds}})
        mongo_docs_found_count = 0

        for doc in old_docs_cursor:
            mongo_docs_found_count += 1
            doc_id = doc['_id']
            print(f"Processing document ID: {doc_id}, created_at: {doc.get('created_at')}")

            # Extract possible Redis keys from document
            redis_keys_in_doc = [
                doc.get("lot_key"),
                doc.get("lot_history_key"),
                doc.get("auction_history_key")
            ]
            redis_keys_to_delete = [key for key in redis_keys_in_doc if key]

            print(f"Redis keys to attempt deletion for doc {doc_id}: {redis_keys_to_delete}")

            # If no keys to delete, mark doc for deletion from MongoDB anyway
            if not redis_keys_to_delete:
                processed_mongo_docs_ids.append(doc_id)
                continue

            deleted_for_this_doc_session = 0
            for redis_key in redis_keys_to_delete:
                try:
                    # If key is part of 'lot' hash, delete it from that hash
                    if redis_key.startswith("lot:"):
                        if redis_cluster.hdel("lot", redis_key) > 0:
                            print(f"Successfully deleted Redis key: {redis_key}")
                            deleted_redis_keys_count += 1
                            deleted_for_this_doc_session += 1
                            deleted_redis_keys.append(redis_key)
                        else:
                            print(f"Redis key not found or not deleted: {redis_key}")
                    else:
                        if redis_cluster.delete(redis_key) > 0:
                            print(f"Successfully deleted Redis key: {redis_key}")
                            deleted_redis_keys_count += 1
                            deleted_for_this_doc_session += 1
                            deleted_redis_keys.append(redis_key)
                        else:
                            print(f"Redis key not found or not deleted: {redis_key}")
                except redis_py.exceptions.RedisError as re:
                    print(f"RedisError deleting key {redis_key}: {re}")
                except Exception as e:
                    print(f"Unexpected error deleting Redis key {redis_key}: {e}")

            # Mark document for deletion after processing Redis keys
            processed_mongo_docs_ids.append(doc_id)

        print(f"Found {mongo_docs_found_count} documents older than cutoff.")

        # Attempt to delete processed documents from MongoDB
        mongo_docs_deleted_successfully_count = 0
        if processed_mongo_docs_ids:
            try:
                delete_result = mongo_collection.delete_many({"_id": {"$in": processed_mongo_docs_ids}})
                mongo_docs_deleted_successfully_count = delete_result.deleted_count
                print(f"Successfully deleted {mongo_docs_deleted_successfully_count} MongoDB documents.")
                if mongo_docs_deleted_successfully_count != len(processed_mongo_docs_ids):
                    print(f"Warning: Mismatch in expected vs. actual MongoDB deletions.")
            except pymongo_errors.PyMongoError as pme:
                print(f"Error deleting documents from MongoDB: {pme}")
        else:
            print("No MongoDB documents marked for deletion.")

        stage = os.environ.get('STAGE', 'unknown')

        # Send summary via SNS if topic is configured
        if sns_topic_arn:
            sns_client = boto3.client('sns')
            message_payload = {
                'status': 'SUCCESS',
                'deleted_redis_keys_count': deleted_redis_keys_count,
                'mongo_docs_queried_count': mongo_docs_found_count,
                'mongo_docs_processed_for_deletion_count': len(processed_mongo_docs_ids),
                'mongo_docs_actually_deleted_count': mongo_docs_deleted_successfully_count,
                'deleted_redis_keys': deleted_redis_keys,
                'redis_cluster_endpoint': os.environ.get("REDIS_CLUSTER_ENDPOINT", "Unknown"),
                'cutoff_timestamp_seconds': cutoff_timestamp_seconds,
                'report_time': datetime.now().isoformat()
            }

            sns_client.publish(
                TopicArn=sns_topic_arn,
                Message=json.dumps(message_payload, indent=4),
                Subject=f'{stage}: Cron job redis cleanup'
            )
            print("SNS alert sent.")
        else:
            print("SNS_TOPIC_ARN not set. No alert sent.")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Successfully processed. Deleted {deleted_redis_keys_count} Redis keys. Processed {len(processed_mongo_docs_ids)} MongoDB docs for deletion ({mongo_docs_deleted_successfully_count} actually deleted).'
            })
        }

    except Exception as e:
        # In case of unexpected failure, send detailed error via SNS
        detailed_error = traceback.format_exc()
        print(f"Critical error in delete_old_redis_data: {e}\n{detailed_error}")
        if sns_topic_arn:
            sns_client = boto3.client('sns')
            error_message = {
                'status': 'ERROR',
                'error_type': type(e).__name__,
                'error_message': str(e),
                'traceback': detailed_error,
                'redis_cluster_endpoint': os.environ.get("REDIS_CLUSTER_ENDPOINT", "Unknown"),
                'report_time': datetime.now().isoformat(),
                'undeleted_redis_keys': list(set(redis_keys_to_delete) - set(deleted_redis_keys)) if 'redis_keys_to_delete' in locals() else [],
                'successfully_deleted_keys': deleted_redis_keys if 'deleted_redis_keys' in locals() else []
            }
            sns_client.publish(
                TopicArn=sns_topic_arn,
                Message=json.dumps(error_message),
                Subject=': Cron job redis cleanup'
            )
        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': f'Critical error during Redis data deletion via MongoDB: {str(e)}'
            })
        }
