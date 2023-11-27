import os
import pymongo
from bson import Int64
from datetime import datetime

def convert_dates_to_timestamp(collection,cursor):
    try:
        for document in cursor:
            a=document['_id']
            start_date = document.get("start_date", {})
            end_date = document.get("end_date", {})
            print(start_date,end_date)
            
            if isinstance(start_date, datetime) and is_valid_date(start_date):
                start_timestamp = int(start_date.timestamp())# Convert datetime to Unix timestamp (milliseconds)
                collection.update_one({"_id": document["_id"]}, {"$set": {"start_date": start_timestamp}})

            if isinstance(end_date, datetime) and is_valid_date(end_date):
                end_timestamp = int(end_date.timestamp()) # Convert datetime to Unix timestamp (milliseconds)
                collection.update_one({"_id": document["_id"]}, {"$set": {"end_date": end_timestamp}})
    except:
        print(a)

def is_valid_date(date):
    # Check if the year is within a reasonable range
    return date.year > 1969 and date.year < 2080

# Initialize MongoDB connection and collection
client = pymongo.MongoClient('mongodb://develop:develop!7edge@indy-auction.cimvoiv4bc2g.eu-west-2.docdb.amazonaws.com:27017/indyauction-develop?authMechanism=DEFAULT&authSource=indyauction-develop&retryWrites=false')
db = client['indyauction-develop']
collection = db['dev-auctions']
cursor = collection.find({'seller_email':'aishwarya+zo@7edge.com'}, {"start_date": 1, "end_date": 1})
# Convert dates to timestamp format
convert_dates_to_timestamp(collection,cursor)
