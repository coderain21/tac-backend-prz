import redis # For redis.exceptions.ResponseError
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
    redis_cluster = createRedisClient()
    sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')
    deleted_count = 0

    try:
        cutoff_date_obj = (datetime.now() - timedelta(days=10)).date()
        cutoff_date_iso_str = cutoff_date_obj.isoformat()
        print(f"Cutoff date: {cutoff_date_iso_str}")

        for key_from_scan in redis_cluster.scan_iter():
            key_type = redis_cluster.type(key_from_scan)
            print(f"Processing key: {key_from_scan}, type: {key_type}")
            operation_performed_on_key_or_field = False

            if key_type == 'string':
                # Rule 1: Check related "{key}:end_date" (string) for this string key
                try:
                    related_end_date_key = f"{key_from_scan}:end_date"
                    if redis_cluster.type(related_end_date_key) == 'string':
                        last_modified_str = redis_cluster.get(related_end_date_key)
                        if last_modified_str:
                            last_modified_dt = datetime.fromisoformat(last_modified_str.replace('Z', '+00:00'))
                            if last_modified_dt.date() < cutoff_date_obj:
                                # Ensure key_from_scan is still a string and exists before deleting
                                if redis_cluster.type(key_from_scan) == 'string' and redis_cluster.exists(key_from_scan):
                                    if redis_cluster.delete(key_from_scan):
                                        deleted_count += 1
                                        operation_performed_on_key_or_field = True
                                        print(f"Deleted string key: {key_from_scan} (reason: related key {related_end_date_key} value {last_modified_str} older than {cutoff_date_iso_str})")
                except redis.exceptions.ResponseError as r_e:
                    print(f"Redis error (Rule 1) for key {key_from_scan}, related {related_end_date_key if 'related_end_date_key' in locals() else 'N/A'}: {r_e}")
                except ValueError as v_e:
                    print(f"Date parsing error (Rule 1) for key {key_from_scan}, related {related_end_date_key if 'related_end_date_key' in locals() else 'N/A'}: {v_e}")
                except Exception as e:
                    print(f"Generic error (Rule 1) for key {key_from_scan}: {e}")

                # Rule 2: Check this string key's content for 'end_date'
                if not operation_performed_on_key_or_field and redis_cluster.exists(key_from_scan) and redis_cluster.type(key_from_scan) == 'string':
                    try:
                        data_str = redis_cluster.get(key_from_scan)
                        if data_str:
                            data = json.loads(data_str)
                            end_date_value = data.get('end_date')
                            if end_date_value:
                                parsed_date_obj = None
                                try:
                                    parsed_date_obj = datetime.fromtimestamp(float(end_date_value) / 1000.0).date()
                                except (TypeError, ValueError):
                                    try:
                                        parsed_date_obj = datetime.strptime(str(end_date_value), '%d-%m-%Y').date()
                                    except ValueError: pass
                                
                                if parsed_date_obj and parsed_date_obj < cutoff_date_obj:
                                    if redis_cluster.delete(key_from_scan):
                                        deleted_count += 1
                                        operation_performed_on_key_or_field = True
                                        print(f"Deleted string key: {key_from_scan} (reason: 'end_date' {end_date_value} in JSON older than {cutoff_date_iso_str})")
                    except redis.exceptions.ResponseError as r_e:
                        print(f"Redis error (Rule 2) for string key {key_from_scan}: {r_e}")
                    except (json.JSONDecodeError, KeyError, TypeError) as e_json:
                        print(f"Data error (Rule 2) for string key {key_from_scan}: {e_json}")
                    except Exception as e:
                        print(f"Generic error (Rule 2) for string key {key_from_scan}: {e}")
                
                # Rule 3: Auction-specific logic for this string key
                if not operation_performed_on_key_or_field and key_from_scan.startswith("auction:") and \
                   redis_cluster.exists(key_from_scan) and redis_cluster.type(key_from_scan) == 'string':
                    try:
                        data_str = redis_cluster.get(key_from_scan)
                        if data_str:
                            data = json.loads(data_str)
                            auction_end_date_ts = data.get('auciton_end_date') or data.get('auction_end_date')
                            if auction_end_date_ts:
                                auction_end_dt_obj = datetime.fromtimestamp(float(auction_end_date_ts) / 1000.0).date()
                                if auction_end_dt_obj < cutoff_date_obj:
                                    if redis_cluster.delete(key_from_scan):
                                        deleted_count += 1
                                        operation_performed_on_key_or_field = True
                                        print(f"Deleted string auction key: {key_from_scan} (reason: end date {auction_end_date_ts} older than {cutoff_date_iso_str})")
                                        
                                        auction_uuid = key_from_scan.split(":", 1)[1] if ":" in key_from_scan else None
                                        if auction_uuid:
                                            lot_id = get_lot_id_by_auction_uuid(auction_uuid)
                                            if lot_id:
                                                related_keys_to_delete = [f"lot:{lot_id}", f"A0001#{lot_id}", f"lot-history:{lot_id}"]
                                                for rel_key in related_keys_to_delete:
                                                    if redis_cluster.exists(rel_key):
                                                        if redis_cluster.delete(rel_key): # Deletes key regardless of its type
                                                            deleted_count += 1
                                                            print(f"Deleted related top-level key: {rel_key} (triggered by expired string key {key_from_scan})")
                    except redis.exceptions.ResponseError as r_e:
                        print(f"Redis error (Rule 3) for string key {key_from_scan}: {r_e}")
                    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e_data: # Added ValueError for timestamp
                        print(f"Data error (Rule 3) for string key {key_from_scan}: {e_data}")
                    except Exception as e:
                        print(f"Generic error (Rule 3) for string key {key_from_scan}: {e}")

            elif key_type == 'hash':
                fields_to_delete_names = []
                for field_name, field_value_str in redis_cluster.hscan_iter(key_from_scan):
                    try:
                        field_data = json.loads(field_value_str)
                        parsed_field_date_obj = None
                        date_value_for_log = "N/A"
                        is_auction_context_field = False # Is this field's data auction-related?

                        # Determine date based on HASH key name and field content
                        if key_from_scan == "auction": # Fields within HASH "auction"
                            is_auction_context_field = True
                            target_date_ts = field_data.get('auciton_end_date') or field_data.get('auction_end_date')
                            date_value_for_log = target_date_ts
                            if target_date_ts:
                                parsed_field_date_obj = datetime.fromtimestamp(float(target_date_ts) / 1000.0).date()
                        elif key_from_scan == "lot": # Fields within HASH "lot"
                            target_date_value = field_data.get('end_date')
                            date_value_for_log = target_date_value
                            if target_date_value:
                                try:
                                    parsed_field_date_obj = datetime.fromtimestamp(float(target_date_value) / 1000.0).date()
                                except (TypeError, ValueError):
                                    try:
                                        parsed_field_date_obj = datetime.strptime(str(target_date_value), '%d-%m-%Y').date()
                                    except ValueError: pass
                        # Add other specific hash key handlers here if needed (e.g. "lot-history")

                        if parsed_field_date_obj and parsed_field_date_obj < cutoff_date_obj:
                            fields_to_delete_names.append(field_name)
                            print(f"Marked field for deletion: {field_name} from hash {key_from_scan} (reason: date {date_value_for_log} older than {cutoff_date_iso_str})")
                            operation_performed_on_key_or_field = True # A field will be deleted

                            if is_auction_context_field:
                                auction_uuid_from_field_data = field_data.get("auction_id") or field_data.get("_id")
                                if auction_uuid_from_field_data:
                                    lot_id = get_lot_id_by_auction_uuid(auction_uuid_from_field_data)
                                    if lot_id:
                                        related_top_level_keys_to_delete = [f"lot:{lot_id}", f"A0001#{lot_id}", f"lot-history:{lot_id}"]
                                        for rel_key in related_top_level_keys_to_delete:
                                            if redis_cluster.exists(rel_key):
                                                if redis_cluster.delete(rel_key): # Deletes key regardless of its type
                                                    deleted_count += 1
                                                    print(f"Deleted related top-level key: {rel_key} (due to expired field {field_name} in hash {key_from_scan})")
                                else:
                                    print(f"Warning: Could not get auction_uuid from field {field_name} data in hash {key_from_scan} for related lot deletion.")
                    except redis.exceptions.ResponseError as r_e:
                        print(f"Redis error processing field {field_name} in hash {key_from_scan}: {r_e}")
                    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e_data: # Added ValueError for timestamp
                        print(f"Data error for field {field_name} in hash {key_from_scan} (value: {field_value_str[:100]}...): {e_data}")
                    except Exception as e_gen:
                        print(f"Generic error processing field {field_name} in hash {key_from_scan}: {e_gen}")
                
                if fields_to_delete_names:
                    num_deleted_fields = redis_cluster.hdel(key_from_scan, *fields_to_delete_names)
                    if num_deleted_fields > 0:
                        deleted_count += num_deleted_fields
                        print(f"Successfully deleted {num_deleted_fields} fields from hash {key_from_scan}.")

            elif key_type != 'none':
                print(f"Skipping key {key_from_scan} due to unhandled type: {key_type}")

        # Send alert to SNS
        if sns_topic_arn:
            sns_client = boto3.client('sns')
            message_payload = {
                'deleted_count': deleted_count,
                'redis_cluster': os.environ.get("REDIS_CLUSTER_ENDPOINT", "Unknown"),
                'cutoff_date': cutoff_date_iso_str
            }
            sns_client.publish(
                TopicArn=sns_topic_arn,
                Message=json.dumps(message_payload),
                Subject='Redis Data Deletion Alert'
            )
            print(f"Successfully deleted {deleted_count} keys/fields and sent alert to SNS.")
        else:
            print(f"Successfully deleted {deleted_count} keys/fields. SNS_TOPIC_ARN not set, so no alert sent.")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Successfully processed Redis data. Deleted {deleted_count} keys/fields.'
            })
        }

    except Exception as e:
        print(f"Error in delete_old_redis_data: {e}")
        if sns_topic_arn:
            sns_client = boto3.client('sns')
            error_message = {
                'error': str(e),
                'redis_cluster': os.environ.get("REDIS_CLUSTER_ENDPOINT", "Unknown")
            }
            sns_client.publish(
                TopicArn=sns_topic_arn,
                Message=json.dumps(error_message),
                Subject='Redis Data Deletion Error'
            )
        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': f'Error deleting old Redis data: {str(e)}'
            })
        }
