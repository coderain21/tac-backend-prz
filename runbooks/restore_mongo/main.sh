aws s3 sync s3://indyauction-runbooks/backups/ . --include "*backup.zip"
unzip backup.zip
cd dump/qa/

for folder in *-*; do
    new_name="pre-production-${folder#*-}"
    mv "$folder" "$new_name"
done
cd ../..
mongorestore --uri "$(aws ssm get-parameter --name "MONGODB_CONNECTION_STRING" --region "eu-west-2" --with-decryption --output text --query Parameter.Value)" dump/qa/
rm -r dump backup.zip