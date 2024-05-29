from pymongo import MongoClient
import os

# Replace the URI string with your MongoDB deployment's connection string.
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db[os.environ['SELLERS_TABLE']]



# Function to update the documents with the full_name field.
def add_full_name():
    # Find all documents in the collection.
    documents = collection.find()

    for doc in documents:
        # Concatenate first_name and last_name to form full_name.
        first_name = doc.get('first_name', '')
        last_name = doc.get('last_name', '')
        full_name = f"{first_name} {last_name}"

        # Update the document with the new full_name field.
        collection.update_one(
            {'_id': doc['_id']},
            {'$set': {'full_name': full_name}}
        )

        print(f"Document with ID {doc['_id']} has been updated with the full_name field.")

    print("All documents have been updated with the full_name field.")

# Call the function to perform the update.
add_full_name()
