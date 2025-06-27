import json
import os
from pathlib import Path
from importlib.metadata import metadata, PackageNotFoundError

# Define the paths to requirements files
requirements_files = [
    'devops/dependency/python/requirements.txt',
    'devops/dependency/python/requirements2.txt'
]

# Collect unique package names (ignoring versions for now)
package_names = set()
for file in requirements_files:
    with open(file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                # Extract only the package name (ignore extras and versions)
                name = line.split('==')[0].split('>=')[0].split('<=')[0].strip()
                package_names.add(name.lower())

# Get license and description
package_info = {}
for name in sorted(package_names):
    try:
        meta = metadata(name)
        version = meta.get('Version', 'unknown')
        license_str = meta.get('License', 'unknown')
        description = meta.get('Summary', '')
        key = f"{name}=={version}"
        package_info[key] = {
            "license": license_str,
            "description": description
        }
    except PackageNotFoundError:
        package_info[name] = {
            "license": "Package not found",
            "description": ""
        }

# Write to licenses.json
with open("python-licenses.json", "w") as f:
    json.dump(package_info, f, indent=2)

print("licenses generated.")
