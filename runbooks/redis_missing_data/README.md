# Redis Missing Data - Add Key Script

This script synchronizes missing fields from MongoDB to Redis for lot data.

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

## Usage

### Sync Single Field
```bash
python add_key.py
```

### Modify for Different Fields
Edit the script to sync different fields:

```python
# Example: sync different fields
sync_field("lot_id_here", "starting_price")
sync_field("lot_id_here", "current_bid")
sync_field("lot_id_here", "auction_end_time")
```

## What It Does

1. **Fetches lot data** from MongoDB using lot ID
2. **Checks Redis** for existing lot data
3. **Updates missing fields** in Redis without overwriting existing data
4. **Inserts complete lot** if Redis key doesn't exist

## Important Notes

- ⚠️ **Run only from EC2** - External access to DocumentDB/Redis may be restricted
- ⚠️ **Test with single lot** before bulk operations
- ⚠️ **Backup Redis data** before running in production
- ✅ **Safe operation** - Only adds missing fields, doesn't overwrite existing data

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