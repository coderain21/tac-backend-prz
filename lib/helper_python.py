'''for sending email'''
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from Crypto.Random import get_random_bytes
import os
import json
import time
import boto3
import redis

redis_client = redis.Redis(host=os.environ["REDIS_ENDPOINT"], port=6379)

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

def update_lot_data(item): 
    print('itemssss', item)
    lot_id = str(item['_id'])
    bid_key = f'lot:{lot_id}'
    existing_record =  redis_client.hget('lot', bid_key)
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
    cache_update = redis_client.hset('lot', bid_key, json.dumps(update_request))
