import os
import pymongo


client = pymongo.MongoClient('mongodb://indyauctionmaster:IndyAuction7EDGE@localhost:27017/dev?authMechanism=SCRAM-SHA-1&authSource=dev&retryWrites=false&directConnection=true')
db = client['dev']
collection = db['dev-bid-informations']
# collection_bidders = db[os.environ["UNIQUE_BIDDERS_COLLECTIONS"]]
# user_collection = db[os.environ['SELLERS_TABLE']]


for doc in collection.find({ "paddle_number": { "$type": "string" } }):
    print('processing')
    new_paddle_number = int(doc["paddle_number"])
    collection.update_one({ "_id": doc["_id"] }, { "$set": { "paddle_number": new_paddle_number } })


print('done')