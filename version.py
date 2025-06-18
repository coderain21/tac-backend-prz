import requests
import json
import os
import subprocess
import sys
from datetime import datetime

def execute_cli_command(command):
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        print(result.stdout)
        if result.returncode == 0:
            print("Command executed successfully!")
        else:
            print("Command execution failed.")
    except Exception as e:
        print(f"Error executing command: {str(e)}")

try:
    args = sys.argv

    if len(sys.argv) < 3:
        print("Usage: version.py <version> <stage>")
        sys.exit(1)

    version = sys.argv[1]
    stage = sys.argv[2]

    print(f"Running version.py with version: {version} and stage: {stage}")
# Use `version` and `stage` as needed


    # Normalize version if too short
    if len(version) < 5:
        version = version + ".0"
    if version.lower() == "unknown":
        print("Version is 'unknown'. Skipping API call.")
        sys.exit(0)

    # Get current UTC datetime in required format
    merged_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # Payload with version and timestamps
    payload = {
        "updateItems": {
            "seller_web_application": {
                "latest_version": version,
                "released_time": merged_time
            }
        },
        "stage": stage
    }

    url = 'https://apis.pre-production.indyauction.net/v1/app-version/update'
    print(f"Sending payload:\n{json.dumps(payload, indent=2)}")

    r = requests.post(url, data=json.dumps(payload), headers={"Content-type": "application/json"})

    print(f"API Response Code: {r.status_code}")
    print(f"API Response Body: {r.text}")

    # Uncomment this if you want to notify New Relic
    # execute_cli_command(f'./newrelic entity deployment create --guid Mzk4MzQzOXxCUk9XU0VSfEFQUExJQ0FUSU9OfDExMzQzNDQ2Mjk --version {version}')

except Exception as e:
    print(f"Exception: {str(e)}")
