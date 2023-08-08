#!/bin/bash

# Execute the Python code and capture the output
result=$(python3 access_token_genation.py)

# Print the value of the variable
export TOKEN=$result
dredd