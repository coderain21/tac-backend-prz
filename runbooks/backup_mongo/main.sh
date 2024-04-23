sudo apt-get install -y awscli
mongodump --uri "$(aws ssm get-parameter --name "MONGODB_CONNECTION_STRING" --region "eu-west-2" --with-decryption --output text --query Parameter.Value)"
zip -r backup.zip dump
aws s3 sync . s3://indyauction-runbooks/backups/ --exclude "*" --include "backup.zip" --acl public-read
rm -r dump backup.zip