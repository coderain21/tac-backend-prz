import redis
import os
import json
import boto3
from rediscluster import RedisCluster
from datetime import datetime, timedelta
from lib.mongodb_python_helper import get_lot_id_by_auction_uuid


def createRedisClient():
    try:
        startup_nodes = [
            {
                "host": os.environ["REDIS_CLUSTER_ENDPOINT"],
                "port": 6379
            }
        ]
        cluster = RedisCluster(
            startup_nodes=startup_nodes,
            decode_responses=True,
            skip_full_coverage_check=True
        )
        return cluster
    except (ConnectionError, Exception) as e:
        print(f"Error connecting to Redis: {e}")
        raise

def delete_old_redis_data(event, context):
    """
    Deletes data from Redis older than 10 days and sends an alert to SNS.
    """
    redis_cluster = createRedisClient()
    sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')

    try:
        # Calculate the cutoff date (10 days ago)
        cutoff_date = datetime.now() - timedelta(days=10)

        deleted_count = 0
        # Iterate through all keys in Redis
        for key in redis_cluster.scan_iter():
            try:
                # Get the last modified time of the key (assuming it's stored as a string)
                last_modified_str = redis_cluster.get(f"{key}:modified")
                if last_modified_str:
                    last_modified = datetime.fromisoformat(last_modified_str.replace('Z', '+00:00'))
                    # Delete the key if it's older than the cutoff date
                    if last_modified < cutoff_date:
                        redis_cluster.delete(key)
                        deleted_count += 1
                        print(f"Deleted key: {key}")
            except Exception as e:
                print(f"Error processing key {key}: {e}")
                continue
            try:
                data_str = redis_cluster.get(key)
                if data_str:
                    data = json.loads(data_str)
                    end_date_value = data.get('end_date')
                    if end_date_value:
                        try:
                            # Try parsing as timestamp first
                            end_date = datetime.fromtimestamp(end_date_value / 1000.0)
                        except (TypeError, ValueError):
                            try:
                                # Try parsing as dd-mm-yyyy format
                                end_date = datetime.strptime(end_date_value, '%d-%m-%Y')
                            except ValueError as e:
                                print(f"Error parsing date for key {key}: {e}")
                                continue

                        if end_date < cutoff_date:
                            redis_cluster.delete(key)
                            deleted_count += 1
                            print(f"Deleted key: {key}")
            except (json.JSONDecodeError, KeyError, TypeError) as e:
                print(f"Error processing key {key}: {e}")
                continue
            if key.startswith("auction:"):
                try:
                    data_str = redis_cluster.get(key)
                    if data_str:
                        data = json.loads(data_str)
                        auction_end_date_timestamp = data.get('auciton_end_date')
                        if auction_end_date_timestamp:
                            auction_end_date = datetime.fromtimestamp(auction_end_date_timestamp / 1000.0)
                            if auction_end_date < cutoff_date:
                                redis_cluster.delete(key)
                                deleted_count += 1
                                print(f"Deleted key: {key}")
                                auction_uuid = key.split(":")[1]
                                lot_id = get_lot_id_by_auction_uuid(auction_uuid)
                                if lot_id:
                                    related_keys = [f"lot:{lot_id}", f"A0001#{lot_id}", f"lot-history:{lot_id}"]
                                    for related_key in related_keys:
                                        redis_cluster.delete(related_key)
                                        deleted_count += 1
                                        print(f"Deleted key: {related_key}")
                except (json.JSONDecodeError, KeyError, TypeError) as e:
                    print(f"Error processing auction key {key}: {e}")
                    continue

        # Send alert to SNS
        sns_client = boto3.client('sns')
        message = {
            'deleted_count': deleted_count,
            'redis_cluster': os.environ["REDIS_CLUSTER_ENDPOINT"],
            'cutoff_date': cutoff_date.isoformat()
        }
        sns_client.publish(
            TopicArn=sns_topic_arn,
            Message=json.dumps(message),
            Subject='Redis Data Deletion Alert'
        )

        print(f"Successfully deleted {deleted_count} keys and sent alert to SNS.")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Successfully deleted {deleted_count} keys and sent alert to SNS.'
            })
        }

    except Exception as e:
        print(f"Error: {e}")
        # Send error alert to SNS
        sns_client = boto3.client('sns')
        error_message = {
            'error': str(e),
            'redis_cluster': os.environ["REDIS_CLUSTER_ENDPOINT"]
        }
        sns_client.publish(
            TopicArn=sns_topic_arn,
            Message=json.dumps(error_message),
            Subject='Redis Data Deletion Error'
        )
        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': f'Error deleting old Redis data: {e}'
            })
        }
