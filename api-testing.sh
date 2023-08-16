#!/bin/bash

# Execute the Python code and capture the output
result=$(python3 access_token_genation.py)

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