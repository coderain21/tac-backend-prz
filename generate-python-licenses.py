from importlib.metadata import distributions
import json
import requests

# Step 1: Map all installed distributions
installed_packages = {}
for dist in distributions():
    installed_packages[dist.metadata['Name'].lower()] = dist

# Step 2: Extract package names from requirements.txt
requirements_files = [
    'devops/dependency/python/requirements.txt',
    'devops/dependency/python/requirements2.txt'
]

package_names = set()
for file in requirements_files:
    try:
        with open(file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    name = line.split('==')[0].split('>=')[0].split('<=')[0].strip()
                    package_names.add(name.lower())
    except FileNotFoundError:
        continue

# Step 3: Manual fallback for known non-PyPI packages
excluded_packages = {'wkhtmltopdf', 'crypto', 'cfnresponse'}
manual_license_overrides = {
    "crypto": "Unverified – not pycryptodome",
    "cfnresponse": "Apache Software License"
}

# Step 4: Helper for PyPI fallback
def fetch_license_from_pypi(pkg_name):
    try:
        res = requests.get(f"https://pypi.org/pypi/{pkg_name}/json", timeout=5)
        if res.status_code != 200:
            return "Not found on PyPI", ""
        info = res.json().get("info", {})
        license_str = info.get("license", "").strip()
        description = info.get("summary", "").strip()

        # Fallback: check classifiers if license is blank or 'UNKNOWN'
        if not license_str or license_str.lower() == 'unknown':
            classifiers = info.get("classifiers", [])
            for c in classifiers:
                if "License ::" in c:
                    license_str = c.split("::")[-1].strip()
                    break

        return license_str or "unknown", description
    except Exception as e:
        return f"Error: {e}", ""

# Step 5: Build final report
package_info = {}
for name in sorted(package_names):
    if name in excluded_packages:
        package_info[name] = {
            "license": "Not a PyPI package",
            "description": ""
        }
        continue

    dist = installed_packages.get(name)
    if dist:
        meta = dist.metadata
        version = meta.get("Version", "unknown")
        license_str = meta.get("License", "").strip()
        description = meta.get("Summary", "").strip()

        # Fallback if local metadata is incomplete
        if not license_str or license_str.lower() == 'unknown':
            license_str, _ = fetch_license_from_pypi(name)

        key = f"{meta['Name']}=={version}"
        package_info[key] = {
            "license": license_str,
            "description": description
        }
    else:
        # Try manual override or fetch from PyPI
        license_str = manual_license_overrides.get(name, "")
        description = ""
        if not license_str:
            license_str, description = fetch_license_from_pypi(name)

        package_info[name] = {
            "license": license_str,
            "description": description
        }

# Step 6: Save to file
with open("python-licenses.json", "w") as f:
    json.dump(package_info, f, indent=2)

print("✅ Licenses generated with local + PyPI fallback.")
