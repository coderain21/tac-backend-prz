#!/bin/bash

# Define the source directory where the services folders are located
services_directory="services"

# Define the destination directory where the JSON files will be copied
destination_directory="swaggerdocs"

# Create the destination directory if it doesn't exist
mkdir -p "$destination_directory"

# Iterate through each folder in the services directory
for folder in "$services_directory"/*/
do
  # Extract the folder name
  folder_name=${folder%*/}
  folder_name=${folder_name##*/}

  # Enter the folder
  cd "$folder"

  # Copy all .json files (excluding package.json and package-lock.json) to the destination directory
  find . -type f -name "*swagger.json" ! -name "package.json" ! -name "package-lock.json" -exec cp {} "../$destination_directory" \;

  # Move back to the parent directory
  cd ..
done

echo "JSON files (except package.json and package-lock.json) copied to $destination_directory"