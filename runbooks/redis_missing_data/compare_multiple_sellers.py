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
db = mongo_client["prod"]          # your DB
collection = db["prod-lots"]       # your collection

# Redis cluster connection
r = RedisCluster(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True, skip_full_coverage_check=True)

def sync_lots_data():
    # List of sellers to check
    sellers = [
        "testops@7edge.in",
        "testops+1@7edge.in",

    ]
    
    # Auction IDs to check
    auction_ids = ["A0001", "A0002", "A0003", "A0004"]
    
    # Find lots matching criteria for all sellers and auctions
    lots = collection.find({
        "auction_id": {"$in": auction_ids},
        "seller_email": {"$in": sellers}
    })

    redis_key = "lot"
    processed_count = 0
    error_count = 0
    missing_lots = []
    corrupted_lots = []
    different_lots = []
    matching_lots = []

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
                    
                    # Compare fields
                    differences = []
                    
                    # Check for fields in MongoDB that are missing in Redis
                    for field, mongo_value in lot.items():
                        if field not in existing_data:
                            differences.append({
                                'field': field,
                                'mongo': mongo_value,
                                'redis': None,
                                'status': 'missing in Redis'
                            })
                        else:
                            redis_value = existing_data[field]
                            # Handle ObjectId comparison
                            if isinstance(mongo_value, ObjectId):
                                mongo_str = str(mongo_value)
                                redis_str = str(redis_value) if redis_value else None
                                if mongo_str != redis_str:
                                    differences.append({
                                        'field': field,
                                        'mongo': mongo_str,
                                        'redis': redis_str
                                    })
                            elif redis_value != mongo_value:
                                differences.append({
                                    'field': field,
                                    'mongo': mongo_value,
                                    'redis': redis_value
                                })
                    
                    # Check for fields in Redis that are missing in MongoDB
                    for field in existing_data:
                        if field not in lot:
                            differences.append({
                                'field': field,
                                'mongo': None,
                                'redis': existing_data[field],
                                'status': 'missing in MongoDB'
                            })
                    
                    if differences:
                        different_lots.append({
                            'lot_id': lot_id,
                            'seller_email': lot.get('seller_email'),
                            'auction_id': lot.get('auction_id'),
                            'differences': differences
                        })
                    else:
                        matching_lots.append(lot_id)
                        
                except json.JSONDecodeError:
                    corrupted_lots.append({
                        'lot_id': lot_id,
                        'seller_email': lot.get('seller_email'),
                        'auction_id': lot.get('auction_id')
                    })
                    
            else:
                missing_lots.append({
                    'lot_id': lot_id,
                    'seller_email': lot.get('seller_email'),
                    'auction_id': lot.get('auction_id')
                })
            
            processed_count += 1
            
        except Exception as e:
            error_count += 1
            continue

    # Print summary report
    print("\n🔍 Multi-Seller Data Comparison Report")
    print("=====================================")
    print(f"Checked sellers: {len(sellers)}")
    print(f"Checked auction IDs: {', '.join(auction_ids)}")
    print(f"\n📊 Overview:")
    print(f"   Total lots processed: {processed_count}")
    print(f"   Matching lots: {len(matching_lots)}")
    print(f"   Different lots: {len(different_lots)}")
    print(f"   Missing from Redis: {len(missing_lots)}")
    print(f"   Corrupted in Redis: {len(corrupted_lots)}")
    print(f"   Errors during processing: {error_count}")

    if missing_lots:
        print(f"\n❌ Missing Lots (not in Redis):")
        for lot in missing_lots:
            print(f"   • Lot {lot['lot_id']} - {lot['seller_email']} - {lot['auction_id']}")

    if corrupted_lots:
        print(f"\n⚠️  Corrupted Lots (invalid JSON in Redis):")
        for lot in corrupted_lots:
            print(f"   • Lot {lot['lot_id']} - {lot['seller_email']} - {lot['auction_id']}")

    if different_lots:
        print(f"\n🔄 Lots with Differences:")
        for diff_lot in different_lots:
            lot_id = diff_lot['lot_id']
            seller = diff_lot['seller_email']
            auction = diff_lot['auction_id']
            print(f"\n   📦 Lot {lot_id} - {seller} - {auction}:")
            for diff in diff_lot['differences']:
                field = diff['field']
                mongo_val = diff['mongo']
                redis_val = diff['redis']
                status = diff.get('status', 'different values')
                
                # Format display values
                if isinstance(mongo_val, (str, list)) and len(str(mongo_val)) > 100:
                    mongo_display = f"{str(mongo_val)[:100]}..."
                else:
                    mongo_display = mongo_val
                    
                if isinstance(redis_val, (str, list)) and len(str(redis_val)) > 100:
                    redis_display = f"{str(redis_val)[:100]}..."
                else:
                    redis_display = redis_val
                
                print(f"      • {field} ({status}):")
                print(f"        MongoDB: {mongo_display}")
                print(f"        Redis:   {redis_display}")

    if matching_lots:
        print(f"\n✅ Matching Lots:")
        print(f"   {len(matching_lots)} lots have identical data in MongoDB and Redis")

# Run the sync
if __name__ == "__main__":
    print("🔍 Starting multi-seller data comparison...")
    sync_lots_data()
    print("\n✨ Comparison completed!")