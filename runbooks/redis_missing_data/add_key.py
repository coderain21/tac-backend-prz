import json
from pymongo import MongoClient
from bson.objectid import ObjectId
from redis.cluster import RedisCluster

# --- Config ---
MONGO_URI = "mongodb://indyauctionAdmin:gEAoiDhO6BePKHX5@new-pre-production.cluster-cvyo280ayvm9.eu-west-2.docdb.amazonaws.com:27017/pre-production?authMechanism=SCRAM-SHA-1&authSource=pre-production&retryWrites=false"
REDIS_HOST = "new-websocket-redis-cluster-enabled.ocwjs7.clustercfg.euw2.cache.amazonaws.com"
REDIS_PORT = 6379
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["pre-production"]          # your DB
collection = db["pre-production-lots"]       # your collection

# Redis cluster connection
r = RedisCluster(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True, skip_full_coverage_check=True)

def sync_lots_data():
    # Find lots matching criteria
    lots = collection.find({
        "auction_id": "A0322",
        "seller_email": "namratha.shettigar+stripe@7edge.com"
    })
    print(lots,"lots")
    redis_key = "lot"    
    for lot in lots:
        lot_id = str(lot["_id"])
        print(lot_id, "kkkkkkkkkkkkkkkkkkkkk")
        field_key = f"lot:{lot_id}"
        # Get lot data from Redis
        existing = r.hget(redis_key, field_key)
        if existing:
            existing_data = json.loads(existing)
            # Compare and update fields
            print(existing_data,"esssssssssss")
            for field, value in lot.items():
                if field not in existing_data or existing_data[field] != value:
                    existing_data[field] = value
                    print(f"✅ Updated field '{field}' with value '{value}' for lot {lot_id}")
            # Save updated data back to Redis
            r.hset(redis_key, field_key, json.dumps(existing_data, default=str))

        else:
            # Insert full lot if Redis key doesn't exist
            r.hset(redis_key, field_key, json.dumps(lot, default=str))
            print(f"✅ Inserted new lot {lot_id} into Redis")

# Run the sync
sync_lots_data()
