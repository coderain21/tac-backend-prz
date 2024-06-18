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