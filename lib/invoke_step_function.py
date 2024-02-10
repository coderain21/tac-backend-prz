'''invoke state machine'''
import json
import boto3
import redis
import os
from lib.common_helper import Encoder
import requests


client_step_function = boto3.client('stepfunctions')
from pymongo import MongoClient
mongo_client = MongoClient(os.environ['MONGO_CLIENT'])
db = mongo_client[os.environ['DATABASE']]
collection = db[os.environ["STEP_FUNCTION_ARN_TABLE"]]


redis_client = redis.Redis(host=os.environ["REDIS_ENDPOINT"], port=6379)

def invoke_state_machine(invocation_params, step_function_arn=None):
    client = boto3.client('stepfunctions')

    params = {
        'stateMachineArn': step_function_arn,
        'input': json.dumps(invocation_params)
    }

    if step_function_arn:
        params['stateMachineArn'] = step_function_arn

    try:
        response = client.start_execution(**params)
        return response
    except Exception as e:
        print(f"Error invoking state machine: {e}")
        return {'status': False}

def invoke_state_machine_for_auction_end(invocation_params, step_function_arn=None):
    client = boto3.client('stepfunctions')

    params = {
        'stateMachineArn': step_function_arn,
        'input': json.dumps(invocation_params)
    }

    if step_function_arn:
        params['stateMachineArn'] = step_function_arn

    try:
        response = client.start_execution(**params)
        return response
    except Exception as e:
        print(f"Error invoking state machine: {e}")
        return {'status': False}


def update_redis_data(auction_record, item): 
    try:
        print('item', item)
        item['initial_end_time'] = item['end_date']
        lot_id = str(item['_id'])
        bid_key = f'lot:{lot_id}'
        existing_record =  redis_client.hget('lot', bid_key)
        get_lot = json.loads(existing_record)
        update_request = {
            **get_lot,
            'lot_end_date': item['end_date'],
            'end_date': item['end_date'],
        }        
        cache_update = redis_client.hset('lot', bid_key, json.dumps(update_request))
        getArn = collection.find_one({"lot_id": str(item['_id'])})
        
        executionArn = getArn['arn']
        response = client_step_function.stop_execution(
            executionArn = executionArn,
            cause = 'User initiated stop'
        )
        itemData = json.dumps(item, cls= Encoder)
        response = client_step_function.start_execution(
            stateMachineArn= os.environ['STATE_MACHINE_LOT_ARN'],
            input=itemData
        )
        update_data = {
            "arn": response['executionArn']
        }

        collection.update_one(
            {"_id": getArn['_id']},
            {"$set": update_data}
        )
        lots = redis_client.hgetall('lot')
        updatedLot = [json.loads(bidder) for bidder in lots.values() if json.loads(bidder)['_id'] == lot_id]
        payload = {
          "lots": updatedLot[0],
        }        
        headersList = {
            "Accept": "*/*",
            "User-Agent": "API TEST",
            "Content-Type": "application/json" 

        }
        req_url = os.environ.get("SOCKET_URL") + "/notification"
        response = requests.request("post", req_url, data=json.dumps(payload, cls= Encoder),  headers=headersList)        
        response.raise_for_status()  # Raise an error for bad responses (4xx and 5xx)
        response_data = response.json()
        return True
    except Exception as e:
        print(e)

