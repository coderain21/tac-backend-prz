#!/bin/bash

# Set the path to the Python script relative to this bash script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_SCRIPT="$SCRIPT_DIR/access_token_genation.py"

generate_token() {
    if [ ! -f "$PYTHON_SCRIPT" ]; then
        echo "Error: $PYTHON_SCRIPT not found. Please ensure the script exists and the path is correct."
        exit 1
    fi

    # Change to script directory (root folder) to ensure private.key is found
    pushd "$SCRIPT_DIR" > /dev/null

    python3 "$PYTHON_SCRIPT" > logins.sh
    logins_file="logins.sh"
    cat logins.sh

    if [ -r "$logins_file" ]; then
        while IFS= read -r line; do
            if [[ $line == export* ]]; then
                eval "$line"
            fi
        done < "$logins_file"
    else
        echo "Error: $logins_file does not exist or is not readable."
        popd > /dev/null
        exit 1
    fi

    popd > /dev/null
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
cd "$SCRIPT_DIR/services" || exit

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