"""
Module: get

This module provides a function for retrieving admin details by email from MongoDB.

"""
import os
from bson import ObjectId
from pymongo import MongoClient


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

def fetch_seller_data_from_auction(auction_id):
    """
    Fetch the seller's email from the auction collection in MongoDB.

    Args:
        auction_id (str): The unique identifier of the auction.

    Returns:
        str: The seller's email associated with the given auction_id or None if not found.
    """
    try:
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        auction_collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]
        data = auction_collection.find_one({"_id":ObjectId(auction_id)})
        client.close()
        if data:
            return data
        return None
    except BaseException as err:
        client.close()
        print(f"Unexpected {err=}, {type(err)=}")
        raise
def fetch_user_pool_data(email):
    """
    Fetch the seller's userpool data from the user pool collection in MongoDB.

    Args:
        email (str): The unique identifier of the pool.

    """
    try:
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        auction_collection = db[os.environ["USERPOOLS_MONGO"]]
        data = auction_collection.find_one({"email_address":email})
        client.close()
        if data:
            return data
        return None
    except BaseException as err:
        client.close()
        print(f"Unexpected {err=}, {type(err)=}")
        raise

def fetch_buyer_data(seller_email,buyer_email):
    """
    Fetch the seller's email from the auction collection in MongoDB.

    Args:
        auction_id (str): The unique identifier of the auction.

    Returns:
        str: The seller's email associated with the given auction_id or None if not found.
    """
    try:
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        auction_collection = db[os.environ["BUYER_COLLECTION"]]
        data = auction_collection.find_one({"email_address": buyer_email,"seller_email": seller_email})
        client.close()
        if data:
            return data
        return None
    except BaseException as err:
        client.close()
        print(f"Unexpected {err=}, {type(err)=}")
        raise

def fetch_seller_data_from_subdomain(auction_id):
    """
    Fetch the seller's email from the auction collection in MongoDB.

    Args:
        auction_id (str): The unique identifier of the auction.

    Returns:
        str: The seller's email associated with the given auction_id or None if not found.
    """
    try:
        client = MongoClient(os.environ['MONGO_CLIENT'])
        db = client[os.environ['DATABASE']]
        auction_collection = db[os.environ["SUB_DOMAIN_TABLE"]]
        seller_data = fetch_seller_data_from_auction(auction_id)
        email_address = seller_data.get("seller_email","")
        data = auction_collection.find_one({"seller_email": email_address})
        client.close()
        if data:
            return data
        return None
    except BaseException as err:
        client.close()
        print(f"Unexpected {err=}, {type(err)=}")
        raise