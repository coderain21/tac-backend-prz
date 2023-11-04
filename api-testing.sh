#!/bin/bash

# Execute the Python code and capture the output
# Execute the Python code and capture the output
result=$(python3 access_token_genation.py > logins.sh)
logins_file="logins.sh"

# Check if the file exists and is readable
if [ -r "$logins_file" ]; then
 # Read each line from the file
 while IFS= read -r line; do
 # Check if the line starts with "export" (assuming there's no leading whitespace)
 if [[ $line == export* ]]; then
 # Remove "export" and leading spaces, and then execute the line to set the environment variable
 eval "$line"
 fi
 done < "$logins_file"
else
 echo "Error: $logins_file does not exist or is not readable."
fi

# Print the value of the variable
export TOKEN=$result

# Go to the services directory
cd services || exit

# Iterate through each folder in the services directory
for folder in */; do
    # Check if dredd.yml file exists in the current folder
    if [ -f "$folder/dredd.yml" ]; then
        # Change to the current folder
        cd "$folder" || exit

        # Execute Dredd and store the exit status
        dredd "$folder/dredd.yml"
        exit_status=$?

        # Move back to the parent directory (services)
        cd ..

        if [ $exit_status -ne 0 ]; then
            # Exit with non-zero status code if any Dredd test fails
            echo "Dredd tests failed in folder: $folder"
            exit $exit_status
        fi
    fi
done

echo "Dredd tests completed."