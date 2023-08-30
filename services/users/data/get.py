"""
Module: get

This module provides a function for retrieving admin details by email from MongoDB.

"""
import os
from pymongo import MongoClient

# MongoDB configuration
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db[os.environ['SELLERS_TABLE']]

def get_by_email(email):
    """
    Retrieve admin details from MongoDB by email.

    Args:
        email (str): Email address to search for.

    Returns:
        dict: Admin details as a dictionary, excluding the password field.
              Returns None if no admin with the specified email is found.
    """
    try:
        query_result = collection.find_one({'email_address': email},{'password':0})
        if query_result:
            return query_result
        return None
    except BaseException as err:
        print(f"Unexpected {err=}, {type(err)=}")
        raise
