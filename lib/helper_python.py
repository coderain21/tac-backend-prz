'''for sending email'''
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from Crypto.Random import get_random_bytes
import os
import json
import time
from rediscluster import RedisCluster
import boto3
import redis


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
            skip_full_coverage_check=True  # Add this option
        )
        return cluster
    except (ConnectionError, Exception) as e:
        print(f"Error connecting to Redis: {e}")

# redis_client = createRedisClient()


# redis_client = redis.Redis(host=os.environ["REDIS_CLUSTER_ENDPOINT"], port=6379)

client = boto3.client('pinpoint-email',region_name = os.environ['REGION'])
def send_pinpoint_email(to_email,from_email,template_data,template_arn):
    print('im here',template_data)
    response = client.send_email(
        FromEmailAddress = from_email,
        Destination = {
            'ToAddresses': [
                to_email,
            ]
        },
        Content={
            'Template': {
                'TemplateArn': template_arn,
                'TemplateData': template_data
            }
        }
    )
    print("response",response)
    return response

def encrypt_with_time_validation(data, secret_key):
    secret_key = secret_key.encode('utf-8')
    # Ensure data is a dictionary
    if not isinstance(data, dict):
        raise ValueError("Data must be a dictionary")

    # Add current timestamp to data
    data["time_stamp"] = int(time.time())

    # Convert dictionary to string
    data_str = json.dumps(data)

    # Create cipher with secret key and random IV
    iv = get_random_bytes(AES.block_size)
    cipher = AES.new(secret_key, AES.MODE_CBC, iv=iv)

    # Encrypt the data string
    encrypted_data = iv + cipher.encrypt(pad(data_str.encode('utf-8'), AES.block_size))

    return encrypted_data.hex()

def decrypt_with_time_validation(encrypted_data_hex, secret_key):
    secret_key = secret_key.encode('utf-8')
    # Convert hexadecimal string back to bytes
    encrypted_data = bytes.fromhex(encrypted_data_hex)

    # Extract IV from the first block of encrypted data
    iv = encrypted_data[:AES.block_size]
    encrypted_data = encrypted_data[AES.block_size:]

    # Create cipher with secret key and extracted IV
    cipher = AES.new(secret_key, AES.MODE_CBC, iv=iv)

    # Decrypt the data
    decrypted_data = unpad(cipher.decrypt(encrypted_data), AES.block_size)

    # Convert bytes back to string
    decrypted_data_str = decrypted_data.decode('utf-8')

    # Convert string back to dictionary
    data = json.loads(decrypted_data_str)

    return data

def update_lot_data(item, lot_id):
    print('inside update lot redis')
    redis_client = createRedisClient()
    bid_key = f'lot:{lot_id}'
    
    try:
        existing_record = redis_client.hget('lot', bid_key)
        if existing_record is None:
            print("No record found for the specified key.")
        else:
            get_lot = json.loads(existing_record)
            if existing_record:
                get_lot = json.loads(existing_record)
            else:
                get_lot = {}

            update_request = {
                **get_lot,
                "title1": item.get('title1', ''),
                "title2": item.get('title2', ''),
                "description": item.get('description', ''),
                "starting_price": item.get('starting_price', 0),
                "low_estimate": item.get('low_estimate', 0),
                "high_estimate": item.get('high_estimate', 0),
                "shipping_details": item.get('shipping_details', ''),
                "tags": item.get('tags', []),
                "images": item.get('images', []),
            }

            if get_lot.get('starting_price') != item.get('starting_price') and get_lot.get('bid_amount'):
                print('Lot has current bid')
                return (400, {"message": "Lot has already been bid"})

            update_request["winning_user"] = update_request.get('winning_user', '')

            # Execute update
            redis_client.hset('lot', bid_key, json.dumps(update_request))
  
    except Exception as e:
        print(f"Error in transaction: {e}")


def get_Lot(item, lot_id):
    redis_client = createRedisClient()
    bid_key = f'lot:{lot_id}'
    existing_record =  redis_client.hget('lot', bid_key)
    if existing_record is None:
        print("No record found for the specified key.")
    else:
        get_lot = json.loads(existing_record)
        if existing_record:
            get_lot = json.loads(existing_record)

        else:
            get_lot = {}

        update_request = {
            **get_lot,
            "title1": item.get('title1', ''),
            "title2": item.get('title2', ''),
            "description": item.get('description', ''),
            "starting_price": item.get('starting_price', 0),
            "low_estimate": item.get('low_estimate', 0),
            "high_estimate": item.get('high_estimate', 0),
            "shipping_details": item.get('shipping_details', ''),
            "tags": item.get('tags', []),
            "images": item.get('images', []),

        }
        update_request["winning_user"] = update_request.get('winning_user', '')
        return update_request



def sqs_trigger_event(json_serializable_list, action, auction_record_str):
    batch_size_lots = 50  # Batch size for lots
    batch_size_queue = 3  # Number of batches to send at once
    total_lots = len(json_serializable_list)
    user_batches = []
    # Batch lots by 30
    for i in range(0, total_lots, batch_size_lots):
        batch_end = min(i + batch_size_lots, total_lots)
        user_batches.append(json_serializable_list[i:batch_end])
    # Send batches of 3 to the queue
    for i in range(0, len(user_batches), batch_size_queue):
        # Get a sublist containing at most 3 batches
        send_batches = user_batches[i:i+batch_size_queue]
        # Prepare entries for each batch in send_batches
        entries = []
        for item in send_batches:
            message_body = 'update status'
            message_attributes = {
            'lots': {'DataType': 'String', 'StringValue': json.dumps(item)},
            'auction': {'DataType': 'String', 'StringValue': auction_record_str},
            'type': {'DataType': 'String', 'StringValue': action},
            }
            entries.append(
                {'Id': str(uuid.uuid4()),
                    'MessageBody': message_body,
                    'DelaySeconds': i,
                'MessageAttributes': message_attributes
                })
        # Send the batch of entries to the queue
        cc = sqs.send_message_batch(
            QueueUrl=os.environ["LOT_UPDATE_QUEUE_URL"],
            Entries=entries
        )
        print('cc', cc)
