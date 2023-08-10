"""
Module: get

This module provides a function for retrieving admin details by email from MongoDB.

"""
import os
from pymongo import MongoClient

# 

def get_by_email(email,collection):
    """
    Retrieve admin details from MongoDB by email.

    Args:
        email (str): Email address to search for.

    Returns:
        dict: Admin details as a dictionary, excluding the password field.
              Returns None if no admin with the specified email is found.
    """
    try:
        # MongoDB configuration
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        collection_sellers = db[collection]

        query_result = collection_sellers.find_one({'email_address': email},{'password':0})
        
        client.close()
        if query_result:
            return query_result
        return None
    except BaseException as err:
        client.close()
        print(f"Unexpected {err=}, {type(err)=}")
        raise
