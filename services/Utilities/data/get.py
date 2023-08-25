"""
Module: get

This module provides a function for retrieving user details by email from MongoDB.

"""
import os
from pymongo import MongoClient

# MongoDB configuration
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db[os.environ['USER_TABLE']]

def get_by_email(email):
    """
    Retrieve users details from MongoDB by email.

    Args:
        email (str): Email address to search for.

    Returns:
        dict: user details as a dictionary,
    """
    try:
        query_result = collection.find_one({'email': email},{'_id':0})
        if query_result:
            return query_result
        return None
    except BaseException as err:
        print(f"Unexpected {err=}, {type(err)=}")
        raise
