'''this script will add the full_name to the database'''
from pymongo import MongoClient
import os

# Replace the URI string with your MongoDB deployment's connection string.
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db[os.environ['SELLERS_TABLE']]



# Function to update the documents with the full_name field.
def full_name_fix():
    print('Starting full_name_fix')
    # Find all documents in the collection.
    documents = collection.find({})  # Use an empty dictionary to find all documents.
    # print('found', list(documents))

    for doc in documents:
        # Concatenate first_name and last_name to form full_name.
        print('here')
        first_name = doc.get('first_name', '')
        last_name = doc.get('last_name', '')
        if not first_name and not last_name:
            full_name = ''
        if not first_name:
            full_name = last_name
        elif not last_name:
            full_name = first_name
        else:
            full_name = f"{first_name} {last_name}"

        # Update the document with the new full_name field.
        collection.update_one(
            {'_id': doc['_id']},
            {'$set': {'full_name': full_name}}
        )

        print(f"Document with ID {doc['_id']} has been updated with the full_name field.")

# Example call to the function
full_name_fix()
