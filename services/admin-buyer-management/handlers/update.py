'''This module is used to update the auction details'''
import os
import pymongo

client = pymongo.MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db[os.environ["LOT_COLLECTION_NAME"]]
# collection_bidders = db[os.environ["UNIQUE_BIDDERS_COLLECTIONS"]]
# user_collection = db[os.environ['SELLERS_TABLE']]


for doc in collection.find({ "paddle_number": { "$type": "string" } }):
    print('processing')
    new_paddle_number = int(doc["paddle_number"])
    collection.update_one({ "_id": doc["_id"] }, { "$set": { "paddle_number": new_paddle_number } })


print('done')