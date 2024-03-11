sudo apt-get install -y awscli
aws s3 sync s3://indyauction-runbooks/backups/ . --include "*backup.zip"
unzip backup.zip
cd dump/qa/

for folder in *-*; do
    new_name="pre-production-${folder#*-}"
    mv "$folder" "$new_name"
done
cd ../..
mongorestore --uri "$(aws ssm get-parameter --name "MONGODB_REPLICA_ENDPOINT" --region "eu-west-2" --with-decryption --output text --query Parameter.Value)" dump/qa/
mongosh "$(aws ssm get-parameter --name "MONGODB_REPLICA_ENDPOINT" --region "eu-west-2" --with-decryption --output text --query Parameter.Value)" --eval 'db.getCollection("pre-production-subdomain").updateMany({"subdomain": "www-qa"}, {$set: {"subdomain": "www-pre-production"}}, {multi: true})' 
# mongosh --eval 'db.createCollection("pre-production-buyer-wishlists")'
rm -r dump backup.zip