import redis
import os
import json
import boto3
from datetime import datetime, timedelta

def delete_old_redis_data(event, context):
    """
    Deletes data from Redis older than 10 days and sends an alert to SNS.
    """
    redis_host = os.environ.get('REDIS_HOST')
    redis_port = int(os.environ.get('REDIS_PORT', 6379))
    sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')

    try:
        # Connect to Redis
        r = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)

        # Calculate the cutoff date (10 days ago)
        cutoff_date = datetime.now() - timedelta(days=10)

        deleted_count = 0
        # Iterate through all keys in Redis
        for key in r.scan_iter():
            try:
                # Get the last modified time of the key (assuming it's stored as a string)
                last_modified_str = r.get(f"{key}:modified")
                if last_modified_str:
                    last_modified = datetime.fromisoformat(last_modified_str.replace('Z', '+00:00')) # Handle potential timezone issues
                    # Delete the key if it's older than the cutoff date
                    if last_modified < cutoff_date:
                        r.delete(key)
                        deleted_count += 1
                        print(f"Deleted key: {key}")
            except Exception as e:
                print(f"Error processing key {key}: {e}")

        # Send alert to SNS
        sns_client = boto3.client('sns')
        message = {
            'deleted_count': deleted_count,
            'redis_host': redis_host,
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
            'redis_host': redis_host
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
