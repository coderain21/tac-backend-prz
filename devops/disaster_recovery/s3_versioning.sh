#!/bin/bash

# -------- CONFIG --------
BUCKET_NAME="indyauction-assets-{$STAGE}-v1"  # Change this to your actual bucket name
LIFECYCLE_FILE="lifecycle.json"
# ------------------------

# Step 1: Enable Versioning
echo "Enabling versioning for bucket: $BUCKET_NAME"
aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled

# Step 2: Create Lifecycle JSON
cat > $LIFECYCLE_FILE <<EOF
{
  "Rules": [
    {
      "ID": "DeleteOldVersions",
      "Status": "Enabled",
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 3
      }
    }
  ]
}
EOF

# Step 3: Apply Lifecycle Policy
echo "Applying lifecycle configuration to bucket: $BUCKET_NAME"
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET_NAME" \
  --lifecycle-configuration file://$LIFECYCLE_FILE

# Clean up
rm -f "$LIFECYCLE_FILE"

echo "✅ Done: Versioning enabled and lifecycle rule set to delete non-current versions older than 3 days."
