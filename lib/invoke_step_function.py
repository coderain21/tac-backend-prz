import json
import boto3

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


