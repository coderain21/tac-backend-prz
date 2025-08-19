import json
import warnings
from pymongo import MongoClient
from bson.objectid import ObjectId
from redis.cluster import RedisCluster

# Suppress DocumentDB warning
warnings.filterwarnings("ignore", message="You appear to be connected to a DocumentDB cluster")

# --- Config ---
MONGO_URI = "mongodb://indyauctionAdmin:gEAoiDhO6BePKHX5@new-pre-production.cluster-cvyo280ayvm9.eu-west-2.docdb.amazonaws.com:27017/pre-production?authMechanism=SCRAM-SHA-1"
REDIS_HOST = "new-websocket-redis-cluster-enabled.ocwjs7.clustercfg.euw2.cache.amazonaws.com"
REDIS_PORT = 6379

# --- Connections ---
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


    redis_key = "lot"
    processed_count = 0
    error_count = 0
    
    for lot in lots:
        lot_id = str(lot["_id"])
        field_key = f"lot:{lot_id}"
        
        try:
            # Get lot data from Redis
            existing = r.hget(redis_key, field_key)
            
            if existing:
                try:
                    # Try to parse existing JSON data
                    existing_data = json.loads(existing)
                    print(f"📖 Processing existing lot {lot_id}")
                    
                    # Compare and update all fields - show only actual changes
                    changes_made = []
                    
                    for field, mongo_value in lot.items():
                        redis_value = existing_data.get(field, None)
                        
                        # Check if field needs updating (missing, empty, or different)
                        needs_update = False
                        
                        if field not in existing_data:
                            # Field is missing in Redis
                            needs_update = True
                        elif redis_value is None or redis_value == "" or redis_value == []:
                            # Field is empty in Redis
                            needs_update = True
                        elif redis_value != mongo_value:
                            # Field has different value
                            needs_update = True
                        
                        if needs_update:
                            existing_data[field] = mongo_value
                            changes_made.append({
                                'field': field,
                                'old': redis_value,
                                'new': mongo_value
                            })
                    
                    if changes_made:
                        # Save updated data back to Redis
                        r.hset(redis_key, field_key, json.dumps(existing_data, default=str))
                        
                        print(f"🔄 Updated lot {lot_id} ({len(changes_made)} fields):")
                        for change in changes_made:
                            field = change['field']
                            old_val = change['old']
                            new_val = change['new']
                            
                            # Truncate long values for display
                            if isinstance(old_val, (str, list)) and len(str(old_val)) > 80:
                                old_display = str(old_val)[:80] + "..."
                            else:
                                old_display = old_val
                                
                            if isinstance(new_val, (str, list)) and len(str(new_val)) > 80:
                                new_display = str(new_val)[:80] + "..."
                            else:
                                new_display = new_val
                            
                            print(f"   📝 {field}:")
                            print(f"      Old: {old_display}")
                            print(f"      New: {new_display}")
                    else:
                        print(f"✅ Lot {lot_id} - All fields are correct")
                        
                except json.JSONDecodeError as e:
                    # Handle corrupted JSON data in Redis
                    print(f"⚠️  Corrupted JSON data for lot {lot_id} at char {e.pos}")
                    print(f"   Raw data: {existing[:100]}...")
                    print(f"   Replacing with fresh data from MongoDB")
                    
                    # Replace corrupted data with fresh MongoDB data
                    r.hset(redis_key, field_key, json.dumps(lot, default=str))
                    print(f"✅ Replaced corrupted data for lot {lot_id}")
                    
            else:
                # Insert full lot if Redis key doesn't exist
                r.hset(redis_key, field_key, json.dumps(lot, default=str))
                print(f"✅ Inserted new lot {lot_id} into Redis")
            
            processed_count += 1
            
        except Exception as e:
            error_count += 1
            print(f"❌ Error processing lot {lot_id}: {e}")
            continue
    
    print(f"\n📊 Summary:")
    print(f"   Processed: {processed_count} lots")
    print(f"   Errors: {error_count} lots")

# Run the sync
if __name__ == "__main__":
    print("🚀 Starting Redis-MongoDB sync...")
    sync_lots_data()
    print("✨ Sync completed!")
