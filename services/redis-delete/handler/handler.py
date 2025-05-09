import os
import json
import boto3
import redis as redis_py # Import the redis module
from rediscluster import RedisCluster
from pymongo import MongoClient,errors as pymongo_errors # For MongoDB interaction
from datetime import datetime, timedelta
import traceback # For detailed error logging if needed

# Redis client creation function (remains similar)
def createRedisClient():
    try:
        startup_nodes = [
            {
                "host": os.environ["REDIS_CLUSTER_ENDPOINT"],
                "port": 6379 # Default Redis port
            }
        ]
        # Ensure REDIS_CLUSTER_ENDPOINT is set
        if not os.environ.get("REDIS_CLUSTER_ENDPOINT"):
            raise ValueError("REDIS_CLUSTER_ENDPOINT environment variable not set.")
            
        cluster = RedisCluster(
            startup_nodes=startup_nodes,
            decode_responses=True, # Important for string responses
            skip_full_coverage_check=True
        )
        print("Successfully connected to Redis Cluster.")
        return cluster
    except redis_py.exceptions.RedisClusterException as rce:
        print(f"Error connecting to Redis Cluster (RedisClusterException): {rce}")
        raise
    except Exception as e:
        print(f"Generic error connecting to Redis: {e}")
        raise

# MongoDB client and collection retrieval
def get_mongodb_collection():
    try:
        mongo_uri = os.environ.get("MONGO_URI")
        db_name = os.environ.get("MONGO_DB_NAME")
        collection_name = "redis-cron-data" # As specified

        if not mongo_uri:
            raise ValueError("MONGO_URI environment variable not set.")
        if not db_name:
            raise ValueError("MONGO_DB_NAME environment variable not set.")

        client = MongoClient(mongo_uri)
        # Test connection
        client.admin.command('ping') 
        db = client[db_name]
        print(f"Successfully connected to MongoDB. DB: {db_name}, Collection: {collection_name}")
        return db[collection_name]
    except pymongo_errors.ConnectionFailure as cf:
        print(f"MongoDB connection failed: {cf}")
        raise
    except Exception as e:
        print(f"Error getting MongoDB collection: {e}")
        raise

def delete_old_redis_data(event, context):
    redis_cluster = None
    mongo_collection = None

    try:
        redis_cluster = createRedisClient()
        mongo_collection = get_mongodb_collection()
    except Exception as setup_e:
        print(f"Setup error (Redis or MongoDB connection): {setup_e}")
        # Attempt to send SNS if topic ARN is available, even for setup errors
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
    processed_mongo_docs_ids = [] # Store IDs of docs to be deleted from Mongo

    try:
        # Calculate the cutoff timestamp (10 days ago, Unix timestamp in seconds)
        cutoff_datetime = datetime.now() - timedelta(days=10)
        cutoff_timestamp_seconds = int(cutoff_datetime.timestamp())

        print(f"Cutoff timestamp for MongoDB 'created_at' (seconds): {cutoff_timestamp_seconds} ({cutoff_datetime.isoformat()})")

        # Find documents in MongoDB older than the cutoff
        # Assuming 'created_at' is stored as Unix timestamp in seconds
        old_docs_cursor = mongo_collection.find({"created_at": {"$lt": cutoff_timestamp_seconds}})

        mongo_docs_found_count = 0 # To count how many docs match the query

        for doc in old_docs_cursor:
            mongo_docs_found_count += 1
            doc_id = doc['_id']
            print(f"Processing MongoDB document ID: {doc_id}, created_at: {doc.get('created_at')}")

            redis_keys_in_doc = [
                doc.get("lot_key"),
                doc.get("lot_history_key"),
                doc.get("auction_history_key")
            ]
            # Filter out None values if a key is not present in the document
            redis_keys_to_delete = [key for key in redis_keys_in_doc if key]

            if not redis_keys_to_delete:
                print(f"No valid Redis keys found in document {doc_id}. Marking for deletion from Mongo.")
                processed_mongo_docs_ids.append(doc_id)
                continue

            deleted_for_this_doc_session = 0
            for redis_key in redis_keys_to_delete:
                try:
                    # redis_cluster.delete returns the number of keys deleted (0 or 1 for a single key)
                    if redis_cluster.delete(redis_key) > 0:
                        print(f"Successfully deleted Redis key: {redis_key}")
                        deleted_redis_keys_count += 1
                        deleted_for_this_doc_session += 1
                    else:
                        # This means key did not exist or delete failed for other reason (though delete is usually robust)
                        print(f"Redis key not found or not deleted: {redis_key}")
                except redis_py.exceptions.RedisError as re:
                    print(f"RedisError deleting key {redis_key}: {re}")
                except Exception as e:
                    print(f"Unexpected error deleting Redis key {redis_key}: {e}")
            
            # Mark MongoDB document for deletion if its Redis keys were processed
            processed_mongo_docs_ids.append(doc_id)

        print(f"Found {mongo_docs_found_count} documents in MongoDB older than cutoff.")

        # Batch delete processed documents from MongoDB
        mongo_docs_deleted_successfully_count = 0
        if processed_mongo_docs_ids:
            try:
                delete_result = mongo_collection.delete_many({"_id": {"$in": processed_mongo_docs_ids}})
                mongo_docs_deleted_successfully_count = delete_result.deleted_count
                print(f"Attempted to delete {len(processed_mongo_docs_ids)} docs from MongoDB. Successfully deleted: {mongo_docs_deleted_successfully_count}.")
                if mongo_docs_deleted_successfully_count != len(processed_mongo_docs_ids):
                    print(f"Warning: Mismatch in MongoDB deletions. Expected {len(processed_mongo_docs_ids)}, got {mongo_docs_deleted_successfully_count}.")
            except pymongo_errors.PyMongoError as pme:
                print(f"Error deleting documents from MongoDB: {pme}")
                # Continue to SNS reporting, but note the failure.
        else:
            print("No MongoDB documents were marked for deletion.")


        # Send alert to SNS
        if sns_topic_arn:
            sns_client = boto3.client('sns')
            message_payload = {
                'status': 'SUCCESS',
                'deleted_redis_keys_count': deleted_redis_keys_count,
                'mongo_docs_queried_count': mongo_docs_found_count,
                'mongo_docs_processed_for_deletion_count': len(processed_mongo_docs_ids),
                'mongo_docs_actually_deleted_count': mongo_docs_deleted_successfully_count,
                'redis_cluster_endpoint': os.environ.get("REDIS_CLUSTER_ENDPOINT", "Unknown"),
                'cutoff_timestamp_seconds': cutoff_timestamp_seconds,
                'report_time': datetime.now().isoformat()
            }
            sns_client.publish(
                TopicArn=sns_topic_arn,
                Message=json.dumps(message_payload),
                Subject='Redis Data Deletion Cron Alert (via MongoDB)'
            )
            print(f"Summary: Deleted {deleted_redis_keys_count} Redis keys. Processed {len(processed_mongo_docs_ids)} MongoDB docs. Alert sent to SNS.")
        else:
            print(f"Summary: Deleted {deleted_redis_keys_count} Redis keys. Processed {len(processed_mongo_docs_ids)} MongoDB docs. SNS_TOPIC_ARN not set, no alert sent.")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Successfully processed. Deleted {deleted_redis_keys_count} Redis keys. Processed {len(processed_mongo_docs_ids)} MongoDB docs for deletion ({mongo_docs_deleted_successfully_count} actually deleted).'
            })
        }

    except Exception as e:
        detailed_error = traceback.format_exc()
        print(f"Critical error in delete_old_redis_data: {e}\n{detailed_error}")
        if sns_topic_arn:
            sns_client = boto3.client('sns')
            error_message = {
                'status': 'ERROR',
                'error_type': type(e).__name__,
                'error_message': str(e),
                'traceback': detailed_error, # Provide more details in SNS for critical errors
                'redis_cluster_endpoint': os.environ.get("REDIS_CLUSTER_ENDPOINT", "Unknown"),
                'report_time': datetime.now().isoformat()
            }
            sns_client.publish(
                TopicArn=sns_topic_arn,
                Message=json.dumps(error_message),
                Subject='Redis Data Deletion Cron - CRITICAL ERROR (via MongoDB)'
            )
        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': f'Critical error during Redis data deletion via MongoDB: {str(e)}'
            })
        }

# Example of how to manually test (if run locally, not in Lambda)
#if __name__ == '__main__':
#    # Set environment variables for local testing
#    os.environ['REDIS_CLUSTER_ENDPOINT'] = 'your-redis-endpoint.com'
#    os.environ['MONGO_URI'] = 'mongodb://user:pass@host:port/'
#    os.environ['MONGO_DB_NAME'] = 'your_db_name'
#    os.environ['SNS_TOPIC_ARN'] = 'arn:aws:sns:region:account-id:your-sns-topic'
#    delete_old_redis_data({}, {})
