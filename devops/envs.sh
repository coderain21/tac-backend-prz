#!/bin/sh

# env.sh

# Retrieve all environment variables and format them into JSON
vars=$(printenv | awk -F= '{printf "\"%s\":\"%s\",\n", $1, $2}')
vars="${vars%,}" # Remove the trailing comma

cat <<EOF
{
  $vars
}
EOF
