# Redis Missing Data Scripts

These scripts synchronize data between MongoDB (DocumentDB) and Redis for lot data management.

## Prerequisites

### 1. EC2 Instance Access
This script **must be run inside an EC2 instance** that has access to both MongoDB (DocumentDB) and Redis clusters.

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ec2-user@your-ec2-instance-ip
```

### 2. Required Dependencies
Install Python dependencies on the EC2 instance:

```bash
pip install pymongo redis
```

### 3. Network Access
Ensure the EC2 instance has:
- Security group access to DocumentDB cluster (port 27017)
- Security group access to Redis cluster (port 6379)
- VPC connectivity to both services

## Configuration

Update the connection strings in `add_key.py`:

```python
MONGO_URI = "mongodb://username:password@your-docdb-cluster:27017/database"
REDIS_HOST = "your-redis-cluster-endpoint"
```

## Scripts

### 1. add_key.py - Single Field Sync

**Purpose**: Synchronizes specific missing fields from MongoDB to Redis for individual lots.

**Usage**:
```bash
python add_key.py
```

**Modify for Different Fields**:
```python
# Example: sync different fields
sync_field("lot_id_here", "starting_price")
sync_field("lot_id_here", "current_bid")
sync_field("lot_id_here", "auction_end_time")
```

**What It Does**:
1. Fetches lot data from MongoDB using lot ID
2. Checks Redis for existing lot data
3. Updates missing fields in Redis without overwriting existing data
4. Inserts complete lot if Redis key doesn't exist

### 2. add_data_redis.py - Bulk Data Sync

**Purpose**: Comprehensive bulk synchronization of lots data with detailed change tracking and error handling.

**Usage**:
```bash
python add_data_redis.py
```

**Features**:
- **Bulk Processing**: Syncs multiple lots based on criteria (auction_id, seller_email)
- **Change Tracking**: Shows exactly what fields were updated with before/after values
- **Error Handling**: Handles corrupted JSON data in Redis
- **Smart Comparison**: Properly compares ObjectIds and different data types
- **Progress Reporting**: Detailed output of all changes made

**What It Does**:
1. **Finds lots** matching specific criteria from MongoDB
2. **Compares data** field-by-field between MongoDB and Redis
3. **Updates only changed fields** with detailed logging
4. **Handles corrupted data** by replacing with fresh MongoDB data
5. **Provides summary** of processed lots and errors

## Important Notes

- ⚠️ **Run only from EC2** - External access to DocumentDB/Redis may be restricted
- ⚠️ **Test with single lot** before bulk operations
- ⚠️ **Backup Redis data** before running in production
- ✅ **Safe operation** - Only adds missing fields, doesn't overwrite existing data
- 🔍 **Use add_key.py** for single lot/field updates
- 🔄 **Use add_data_redis.py** for bulk synchronization with detailed tracking

## Troubleshooting

### Connection Issues
```bash
# Test MongoDB connection
mongo --host your-docdb-cluster:27017 --username your-user

# Test Redis connection
redis-cli -h your-redis-cluster-endpoint -p 6379
```

### Permission Issues
Ensure EC2 instance has appropriate IAM roles for DocumentDB and ElastiCache access.

### Corrupted Data
The `add_data_redis.py` script automatically detects and fixes corrupted JSON data in Redis by replacing it with fresh data from MongoDB.