#!/bin/bash

# env.sh
# Retrieve all environment variables and format them into JSON

# Get all environment variables with colon (:) as separator
vars=$(env - | tr '\n' ' ')

# Check if there are any environment variables
if [[ -n "$vars" ]]; then
  # Escape double quotes in variable values using sed
  vars=$(echo "$vars" | sed 's/\\/\\\\/g; s/"/\\"/g')

  # Build JSON string with proper quoting
  json="{ \"$(echo "$vars" | sed 's/ /","/g')\" }"
fi

# Output the JSON object, handle empty case
if [[ -n "$json" ]]; then
  echo "$json"
else
  echo "{}"  # Output empty JSON object if no variables exist
fi