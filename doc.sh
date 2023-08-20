#!/bin/bash

# Define the source directory where the services folders are located
services_directory="services"

# Define the destination directory where the JSON files will be copied
destination_directory="swaggerdocs"

# Create the destination directory if it doesn't exist
mkdir -p "$destination_directory"

# Array to store the unique JSON objects
json_array=()

# Iterate through each folder in the services directory
for folder in "$services_directory"/*/
do
  # Extract the folder name
  folder_name=${folder%*/}
  folder_name=${folder_name##*/}

  # Find and copy the .json files (excluding package.json and package-lock.json) to the destination directory
  find "$folder" -type f -name "*swagger.json" ! -name "package.json" ! -name "package-lock.json" -exec cp {} "$destination_directory" \;

  # Iterate through the copied .json files and build the JSON object
  while IFS= read -r file; do
    # Extract the base name of the *swagger.json file
    base_name=$(basename "$file" -swagger.json)

    # Construct the URL
    url="https://docs.indyaution.net/swagger_api_documentation/$base_name-swagger.json"

    # Check if the JSON object already exists in the array
    duplicate=false
    for json_object in "${json_array[@]}"; do
      if [[ "$json_object" == "{\"name\":\"$base_name\",\"url\":\"$url\"}" ]]; then
        duplicate=true
        break
      fi
    done

    # If the JSON object is not a duplicate, add it to the array
    if [ "$duplicate" = false ]; then
      json_object="{\"name\":\"$base_name\",\"url\":\"$url\"}"
      json_array+=("$json_object")
    fi
  done < <(find "$destination_directory" -type f -name "*swagger.json")
done

# Convert the array to JSON format
json_string=$(printf "%s\n" "${json_array[@]}" | jq -s .)

# Create the final JSON file
echo "$json_string" > "$destination_directory/urls.json"

echo "JSON files (except package.json and package-lock.json) copied to $destination_directory"
echo "urls.json file created with the unique URL mappings"
echo $urls.json