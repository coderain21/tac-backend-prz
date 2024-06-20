"""This module contains a set of functions for user validation and creation in a serverless application. It utilizes Amazon Cognito for user management and MongoDB for data storage.

Module Functions:
- admin_create_user(userData, userpool_id): Create a new user in Amazon Cognito and add them to a Cognito User Group.
- hash_password(password): Generate a salt and hash the given password using bcrypt.
- validate(event, context): Validate user session tokens, create new Cognito users, and store user data in MongoDB.

Please note that the code in this module is designed for use within a serverless environment and relies on various environment variables for configuration and secrets.

The code's primary functionality involves user registration and validation by decrypting session tokens, creating Cognito users, and storing user data in a MongoDB database.
"""
from pymongo import MongoClient

def update_seller_ids():
    # Connect to the MongoDB server
    client = MongoClient("url")

    # Select the database and collection
    db = client[""]
    collection = db[""]

    # Fetch all the documents in the collection
    documents = list(collection.find({}))

    # Iterate over the documents and add seller_id
    for index, doc in enumerate(documents):
        seller_id = f"S{index+1:04d}"
        collection.update_one({"_id": doc["_id"]}, {"$set": {"seller_id": seller_id}})
        print(f"Updated document")

    print("All documents have been updated.")

if __name__ == "__main__":
    update_seller_ids()