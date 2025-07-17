#!/bin/bash

# A script to run Playwright tests for the entire project or for a specific service.
#
# USAGE:
#   ./tdd-test.sh           - Runs all tests in the project.
#   ./tdd-test.sh -s <name> - Runs only the tests for the specified service.
#
# EXAMPLE:
#   ./tdd-test.sh -s lot-bid-history

# Check if the first argument is '-s'
if [ "$1" == "-s" ]; then
  if [ -z "$2" ]; then
    echo "Error: Service name not provided after -s flag."
    echo "Usage: ./tdd-test.sh -s <service-name>"
    exit 1
  fi
  
  SERVICE_NAME=$2
  echo "Running Playwright tests for service: $SERVICE_NAME"
  
  # Set environment variable for the service and use npm test
  export SERVICE_NAME=$SERVICE_NAME
  export TEST_PATH="test/$SERVICE_NAME"
  
  # Use npm test which likely has coverage configured
  npm test -- "test/$SERVICE_NAME"
  
else
  # If no '-s' flag is provided, run all tests using npm test
  echo "Running all Playwright tests..."
  npm test
fi