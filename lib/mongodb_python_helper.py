""" This module contains the view_customer function, which is used to view customer details based on their email address."""
import pymongo
import os


def connect():
    try:
        client = pymongo.MongoClient(os.environ["MONGO_CLIENT"])
        print('MongoDB connected successfully')
        return client
    except Exception as err:
        print('MongoDB connection error:', err)
        return False

# /* `module.exports.save` is a function that takes in two parameters: `document` and `Schema`. It
# creates a new instance of the `Schema` model using the `document` parameter, and then saves it to
# the MongoDB database using the `save()` method. If the save operation is successful, the function
# returns `true`. If there is an error during the save operation, the function logs the error to the
# console and returns `false`. This function can be used to save documents to the database using the
# specified schema. */


def view_profile(id):
    try:
        client = connect()
        Database = client.get_database(os.environ.get('DATABASE'))
        collection = Database.get_collection(
            os.environ.get('MONGODB_COLLECTION_NAME'))
        customer_details = collection.find_one(
            {'email_address': id}, {#'_id': 0,
                                    'password': 0})
        client.close()
        return customer_details
    except Exception as err:
        print('Error retrieving document by unique_id:', err)
        return None

def get_lot_id_by_auction_uuid(auction_uuid):
    try:
        client = connect()
        Database = client.get_database(os.environ.get('DATABASE'))
        collection = Database.get_collection(os.environ.get('LOT_COLLECTION_NAME'))
        lot_details = collection.find_one({'auction_id': auction_uuid}, {'lot_number': 1, '_id': 0})
        client.close()
        if lot_details:
            return lot_details.get('lot_number')
        else:
            return None
    except Exception as err:
        print('Error retrieving lot_id by auction_uuid:', err)
        return None
