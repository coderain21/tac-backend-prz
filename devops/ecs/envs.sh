#!/bin/bash

# Output file for the JSON data
output_file="ssm_variables.json"

# Get all SSM parameters by path (replace with your path if needed)
parameter_names=($(aws ssm describe-parameters --query "Parameters[*].Name" --output text --profile $PROFILE_ENV))

# # Loop through each parameter

# Initialize the JSON array
json_data="[]"

# Loop through each parameter name
for param_name in "${parameter_names[@]}"; do
  # Get the parameter value
  param_value=$(aws ssm get-parameter --name "$param_name" --query "Parameter.Value" --output text --profile $PROFILE_ENV)
  # Build the JSON object for the current parameter
  json_object="{\"name\": \"$name\", \"value\": \"$param_value\"}"

  # Add the object to the JSON array
  json_data=$(echo "$json_data,$json_object")
done

# Remove the leading comma from the JSON array
json_data=${json_data:1}

# Create the final JSON string with opening and closing brackets
final_json="[$json_data]"

# Write the JSON data to the output file
echo "$final_json" > "$output_file"

echo "Successfully created JSON file: $output_file"