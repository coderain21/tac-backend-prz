'''invoke state machine'''
import json
import boto3
import os
from lib.common_helper import Encoder
import requests
from datetime import datetime, timezone



client_step_function = boto3.client('stepfunctions')
from pymongo import MongoClient

mongo_client = MongoClient(os.environ['MONGO_CLIENT'])
db = mongo_client[os.environ['DATABASE']]
collection = db[os.environ["STEP_FUNCTION_ARN_TABLE"]]


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


# def update_redis_data(auction_record, item): 
#     try:
#         pipeline = redis_client.pipeline()
#         start_date_timestamp = auction_record['start_date'] / 1000
#         date_time = datetime.utcfromtimestamp(start_date_timestamp)
#         iso_date_with_offset = date_time.astimezone(timezone.utc).isoformat()
#         item['start_date'] = iso_date_with_offset
#         item['initial_end_time'] = item['end_date']
#         lot_id = str(item['_id'])
#         bid_key = f'lot:{lot_id}'
#         existing_record =  redis_client.hget('lot', bid_key)
#         get_lot = json.loads(existing_record)
#         if existing_record:
#             get_lot = json.loads(existing_record)
#         else:
#             get_lot = {}
            
#         update_request = {
#             **get_lot,
#             'lot_end_date': item['end_date'],
#             'end_date': item['end_date'],
#         }

#         cache_update = pipeline.hset('lot', bid_key, json.dumps(update_request))
#         pipeline.execute()
#         getArn = collection.find_one({"lot_id": str(item['_id'])})
#         executionArn = getArn['arn']

#         response1 = client_step_function.stop_execution(
#             executionArn = executionArn,
#             cause = 'User initiated stop'
#         )
#         lots = redis_client.hgetall('lot')
#         updatedLot = [json.loads(bidder) for bidder in lots.values() if json.loads(bidder)['_id'] == lot_id]
#         response2 = client_step_function.start_execution(
#             stateMachineArn= os.environ['STATE_MACHINE_LOT_ARN'],
#             input= json.dumps(updatedLot[0], cls= Encoder)
#         )
#         update_data = {
#             "arn": response2['executionArn']
#         }

#         collection.update_one(
#             {"_id": getArn['_id']},
#             {"$set": update_data}
#         )
#         payload = {
#           "lots": updatedLot[0],
#         }        
#         headersList = {
#             "Accept": "*/*",
#             "User-Agent": "API TEST",
#             "Content-Type": "application/json" 

#         }
#         req_url = os.environ.get("SOCKET_URL") + "/notification"
#         response = requests.request("post", req_url, data=json.dumps(payload, cls= Encoder),  headers=headersList)        
#         response.raise_for_status()  # Raise an error for bad responses (4xx and 5xx)
#         response_data = response.json()
        
#         return True
#     except Exception as e:
#         print(e)
