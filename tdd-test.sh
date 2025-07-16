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
  
  # Run Playwright, passing the path to the service's test directory.
  npx playwright test "test/$SERVICE_NAME"
  
else
  # If no '-s' flag is provided, run all tests.
  echo "Running all Playwright tests..."
  npx playwright test
fi
