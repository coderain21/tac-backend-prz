#!/bin/bash

# Define source and destination S3 buckets
SOURCE_BUCKET="s3://indyauction-assets-qa"
DESTINATION_BUCKET="s3://indyauction-assets-pre-production"

# Step 1: Download objects from the source bucket
echo "Downloading objects from $SOURCE_BUCKET..."
aws s3 sync $SOURCE_BUCKET .

# Step 2: Upload downloaded files to the destination bucket
echo "Uploading objects to $DESTINATION_BUCKET..."
aws s3 sync . $DESTINATION_BUCKET

echo "Sync completed."