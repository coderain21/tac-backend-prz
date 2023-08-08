"""
Module: common_helper

This module provides common helper functions for encoding and headers.

"""
import decimal
import datetime
import json


class Encoder(json.JSONEncoder):
    """
    Encoder Function for all returns

    Accessibility: Private
    Returns: Dictionary
    """

    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return str(o)
        if isinstance(o, bytes):
            return str(o)
        if isinstance(o, datetime.datetime):
            return str(o)
        if isinstance(o, object):
            return o.__dict__
        return o.__dict__


headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': True,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*'
}
