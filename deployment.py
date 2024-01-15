import os
import json
import requests
from datetime import datetime

# Check if the branch is "staging"
if os.environ.get("BITBUCKET_BRANCH") == "staging":
    # Run this if the branch is staging
    if int(os.environ.get("BITBUCKET_EXIT_CODE", 0)) == 0:
        print("Curl command succeeded.")
        exit_code = "successful"  # Success
    else:
        print("Curl command failed.")
        exit_code = "failed"  # Failure

    print(f"HATICA_KEY={os.environ.get('HATICA_KEY')}")

    current_time_utc = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    data = {
        "id": os.environ.get("BITBUCKET_PIPELINE_UUID"),
        "deployment_id": os.environ.get("BITBUCKET_BUILD_NUMBER"),
        "ref": os.environ.get("BITBUCKET_COMMIT"),
        "repository": f"bitbucket.org/{os.environ.get('BITBUCKET_REPO_FULL_NAME')}",
        "environment": "production",
        "occurred_at": current_time_utc,
        "status": exit_code,
    }

    body = [data]

    print(json.dumps(body, indent=2))
    print(body)

    # Run the requests.post command
    url = "https://events.hatica.io/v1/deployments"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "x-api-key": os.environ.get("HATICA_KEY"),
    }

    response = requests.post(url, headers=headers, json=body)

    if response.status_code == 200:
        print("Request successful.")
    else:
        print(f"Request failed with status code: {response.status_code}")
        print(response.text)
