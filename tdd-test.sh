#!/bin/bash

# A script to run tests for the entire project or for a specific service.
#
# USAGE:
#   ./tdd-test.sh           - Runs all tests in the project.
#   ./tdd-test.sh -s <name> - Runs only the tests for the specified service.
#
# EXAMPLE:
#   ./tdd-test.sh -s lot-bid-history

# Check if the first argument is '-s'
if [ "$1" == "-s" ]; then
  # Check if a service name was provided as the second argument
  if [ -z "$2" ]; then
    echo "Error: Service name not provided after -s flag."
    echo "Usage: ./tdd-test.sh -s <service-name>"
    exit 1
  fi
  
  SERVICE_NAME=$2
  echo "Running tests for service: $SERVICE_NAME"
  
  # Run Jest, passing the path to the service's test directory.
  # This tells Jest to only look for tests within that folder.
  npm test -- "test/$SERVICE_NAME"
  
else
  # If no '-s' flag is provided, run all tests.
  echo "Running all tests..."
  npm test
fi
