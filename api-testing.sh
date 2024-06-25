#!/bin/bash

# Function to generate the token
generate_token() {
    python3 access_token_genation.py > logins.sh
    
    if [ -r "logins.sh" ]; then
        while IFS= read -r line; do
            if [[ $line == export* ]]; then
                eval "$line"
            fi
        done < "logins.sh"
    else
        echo "Error: logins.sh does not exist or is not readable."
        exit 1
    fi
}

while getopts ":s:" opt; do
  case $opt in
    s)
      service="$OPTARG"
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      exit 1
      ;;
    :)
      echo "Option -$OPTARG requires an argument." >&2
      exit 1
      ;;
  esac
done

generate_token

cd services || exit

run_tests() {
  if [ -n "$service" ]; then
    echo "Service: $service"
    if [ -f "$service/dredd.yml" ]; then
        cd "$service" || exit
        dredd "$service/dredd.yml"
        exit_status=$?
        cd ..
        if [ $exit_status -ne 0 ]; then
            echo "Dredd tests failed in folder: $service"
            exit $exit_status
        fi
    fi
    echo "Dredd tests completed for $service."
    return 0
  else
    echo "Running tests for all services."
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
            cd ../
            if [ $exit_status -ne 0 ]; then
                # Exit with non-zero status code if any Dredd test fails
                echo "Dredd tests failed in folder: $folder"
                exit $exit_status
            fi
        fi
    done
    echo "All Dredd tests completed successfully."
    return 0
  fi
}

# Main execution
token_generation_time=$SECONDS

while true; do
    current_time=$SECONDS
    if [ $((current_time - token_generation_time)) -ge 300 ]; then
        echo "Regenerating token..."
        generate_token
        token_generation_time=$SECONDS
    fi

    run_tests
    test_result=$?
    
    if [ $test_result -ne 0 ]; then
        echo "Tests failed. Exiting."
        exit 1
    fi
    
    if [ -n "$service" ]; then
        echo "Tests for specified service completed successfully. Exiting."
        exit 0
    fi
    
    # If we've reached here, it means all tests for all services have completed successfully
    if [ -z "$service" ]; then
        echo "All tests for all services completed successfully. Exiting."
        exit 0
    fi
done