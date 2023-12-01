from pymongo import MongoClient      
def add_to_mongo(auction_id,buyer_email,seller_email):
    client = MongoClient('mongodb://develop:develop!7edge@indy-auction.cimvoiv4bc2g.eu-west-2.docdb.amazonaws.com:27017/indyauction-develop?authMechanism=DEFAULT&authSource=indyauction-develop&retryWrites=false')
    db = client['indyauction-develop']

    counter_collection = db['dev-carts']

    insert_data = [
            {
                "auction_id": auction_id,
                "seller_email": seller_email,
                "lot_number": 22,
                "lot_image": "",
                "email_address": buyer_email,
                "bid_amount": 10000,
                "fees" : 420,
                "lot_title": "sthuthi lot e27",
                "currency": "USD",
                "name": "Aishwarya K"
            }

    ]