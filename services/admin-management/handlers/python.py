import boto3
from pymongo import MongoClient
client = MongoClient(os.environ['MONGO_CLIENT'])
db = client[os.environ['DATABASE']]
collection = db[os.environ["AUCTION_MONGODB_COLLECTION_NAME"]]