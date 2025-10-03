import json
import warnings
from pymongo import MongoClient
from bson.objectid import ObjectId
from redis.cluster import RedisCluster

# Suppress DocumentDB warning
warnings.filterwarnings("ignore", message="You appear to be connected to a DocumentDB cluster")

def json_serializer(obj):
    """Custom JSON serializer to handle MongoDB ObjectId and other types properly"""
    if isinstance(obj, ObjectId):
        return str(obj)
    elif hasattr(obj, 'isoformat'):  # datetime objects
        return obj.isoformat()
    return str(obj)

# --- Config ---
MONGO_URI = "mongodb://localhost:3000"
REDIS_HOST = "127.0.0.1"
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
                        
                        # Proper comparison - only update if values are truly different
                        needs_update = False
                        
                        if field not in existing_data:
                            # Field is completely missing in Redis
                            needs_update = True
                        else:
                            # Handle ObjectId comparison properly
                            if isinstance(mongo_value, ObjectId):
                                mongo_str = str(mongo_value)
                                redis_str = str(redis_value) if redis_value else None
                                if mongo_str != redis_str:
                                    needs_update = True
                            else:
                                # Direct comparison for all other types
                                if redis_value != mongo_value:
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
                        r.hset(redis_key, field_key, json.dumps(existing_data, default=json_serializer))
                        
                        print(f"🔄 Updated lot {lot_id} - Fixed {len(changes_made)} fields:")
                        for change in changes_made:
                            field = change['field']
                            old_val = change['old']
                            new_val = change['new']
                            
                            # Better display formatting
                            if old_val is None:
                                old_display = "None (missing)"
                            elif old_val == "":
                                old_display = "Empty string"
                            elif old_val == []:
                                old_display = "Empty array"
                            elif isinstance(old_val, (str, list)) and len(str(old_val)) > 100:
                                old_display = str(old_val)[:100] + "..."
                            else:
                                old_display = old_val
                                
                            if isinstance(new_val, (str, list)) and len(str(new_val)) > 100:
                                new_display = str(new_val)[:100] + "..."
                            else:
                                new_display = new_val
                            
                            print(f"   🔧 {field}:")
                            print(f"      Before: {old_display}")
                            print(f"      After:  {new_display}")
                    else:
                        print(f"✅ Lot {lot_id} - No changes needed (all data correct)")
                        
                except json.JSONDecodeError as e:
                    # Handle corrupted JSON data in Redis
                    print(f"⚠️  Corrupted JSON data for lot {lot_id} at char {e.pos}")
                    print(f"   Raw data: {existing[:100]}...")
                    print(f"   Replacing with fresh data from MongoDB")
                    
                    # Show what fields are being added/fixed
                    print(f"🔄 Replacing corrupted lot {lot_id} - Adding {len(lot)} fields:")
                    
                    # Show key fields being restored
                    key_fields = ['images', 'title2', 'description', 'current_bid', 'starting_bid', 'seller_email', 'auction_id']
                    for field in key_fields:
                        if field in lot:
                            value = lot[field]
                            if isinstance(value, (str, list)) and len(str(value)) > 100:
                                display_value = str(value)[:100] + "..."
                            else:
                                display_value = value
                            print(f"   🔧 {field}:")
                            print(f"      Before: Corrupted/Missing")
                            print(f"      After:  {display_value}")
                    
                    # Show count of other fields
                    other_fields = [f for f in lot.keys() if f not in key_fields]
                    if other_fields:
                        print(f"   📝 Plus {len(other_fields)} other fields: {other_fields[:5]}{'...' if len(other_fields) > 5 else ''}")
                    
                    # Replace corrupted data with fresh MongoDB data
                    r.hset(redis_key, field_key, json.dumps(lot, default=json_serializer))
                    print(f"✅ Successfully replaced corrupted data for lot {lot_id}")
                    
            else:
                # Insert full lot if Redis key doesn't exist
                r.hset(redis_key, field_key, json.dumps(lot, default=json_serializer))
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
