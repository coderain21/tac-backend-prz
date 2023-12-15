import json
import os
from pymongo import MongoClient


client = MongoClient('mongodb://develop:develop!7edge@indy-auction.cimvoiv4bc2g.eu-west-2.docdb.amazonaws.com:27017/indyauction-develop?authMechanism=DEFAULT&authSource=indyauction-develop&retryWrites=false')
db = client['indyauction-develop']
collection = db['dev-orders']
order_data = collection.find({'auction_id':'657846ded604d2eb91e78c63','seller_email':'anusha.k+subdomain@7edge.com'})
order = list(order_data)
print(order)
for item in order:
    email_address=item['email_address']
    shipping_address = item['shipping_address']
    full_name = f"{shipping_address['first_name']} {shipping_address['last_name']}"
    print(full_name,email_address)
    collection.update_many({'auction_id':'657846ded604d2eb91e78c63','seller_email':'anusha.k+subdomain@7edge.com','email_address':email_address},{'$set':{"name":full_name}})

