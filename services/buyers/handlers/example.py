"""This module is used to view the auction with auction id"""

headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}


def create_auction(event, context):
    """

    """
    print("event", event)
    print("context",context)