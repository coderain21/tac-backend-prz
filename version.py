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
    version = args[1]
    print(f"Version from tag: {version}")

    # Default stage
    stage = "master"

    # Normalize version if too short
    if len(version) < 5:
        version = version + ".0"

    # Get current UTC datetime in required format
    merged_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # Payload with version and timestamps
    payload = {
        "updateItems": {
            "seller_web_application": {
                "latest_version": version,
                "min_version": version,
                "merged_time": merged_time,
                "released_time": merged_time
            }
        },
        "stage": stage
    }

    url = url = os.environ['REACT_APP_DOMAIN_NAME_FRONT_END'] + "/prod/update"
    print(f"Sending payload:\n{json.dumps(payload, indent=2)}")

    r = requests.post(url, data=json.dumps(payload), headers={"Content-type": "application/json"})

    print(f"API Response Code: {r.status_code}")
    print(f"API Response Body: {r.text}")

    # Uncomment this if you want to notify New Relic
    # execute_cli_command(f'./newrelic entity deployment create --guid Mzk4MzQzOXxCUk9XU0VSfEFQUExJQ0FUSU9OfDExMzQzNDQ2Mjk --version {version}')

except Exception as e:
    print(f"Exception: {str(e)}")
