#!/bin/bash

# Set the correct path to the Python script
PYTHON_SCRIPT="/home/user/Desktop/work/backend/indy-auction-backend-apis/access_token_genation.py"

generate_token() {
    python3 "$PYTHON_SCRIPT" > logins.sh
    logins_file="logins.sh"

    if [ -r "$logins_file" ]; then
        while IFS= read -r line; do
            if [[ $line == export* ]]; then
                eval "$line"
            fi
        done < "$logins_file"
    else
        echo "Error: $logins_file does not exist or is not readable."
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

# Change to the services directory
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
            exit $exit_status
        fi
    else
        echo "No dredd.yml found for service: $current_service"
        return 1
    fi
    
    echo "Dredd tests completed for $current_service."
}

if [ -n "$service" ]; then
    run_tests "$service"
else
    for folder in */; do
        folder=${folder%/}  # Remove trailing slash
        run_tests "$folder"
    done
fi

echo "All Dredd tests completed."