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

cd services || exit

run_tests() {
    local current_service=$1
    echo "Testing service: $current_service"
    
    generate_token
    
    if [ -f "$current_service/dredd.yml" ]; then
        cd "$current_service" || exit
        dredd "$current_service/dredd.yml"
        exit_status=$?
        cd ..
        if [ $exit_status -ne 0 ]; then
            echo "Dredd tests failed in folder: $current_service"
            return 1
        fi
    else
        echo "No dredd.yml found for service: $current_service"
        return 1
    fi
    
    echo "Dredd tests completed for $current_service."
    return 0
}

# Main execution
if [ -n "$service" ]; then
    run_tests "$service"
    if [ $? -ne 0 ]; then
        echo "Tests failed for $service. Exiting."
        exit 1
    fi
    echo "Tests for $service completed successfully. Exiting."
    exit 0
else
    for folder in */; do
        folder=${folder%/}  # Remove trailing slash
        run_tests "$folder"
        if [ $? -ne 0 ]; then
            echo "Tests failed for $folder. Exiting."
            exit 1
        fi
    done
    echo "All tests for all services completed successfully. Exiting."
    exit 0
fi