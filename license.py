import requests
import json
import sys

# Open Source Licenses
OPEN_SOURCE_LICENSES = [
    'MIT', 'Apache', 'BSD', 'ISC', 'MPL', 'CDDL', 'MS-PL', 'GNU General Public License'
]

# Packages to skip
SKIP_PACKAGES = {'mailchimp-marketing', 'mailchimp-transactional'}

# Get packages from requirements
def get_required_packages():
    files = [
        'devops/dependency/python/requirements.txt',
        'devops/dependency/python/requirements2.txt'
    ]
    packages = set()
    for file_path in files:
        with open(file_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    pkg = line.split('==')[0].lower()
                    if pkg not in SKIP_PACKAGES:
                        packages.add(pkg)
    return sorted(packages)

# Query PyPI JSON API for license
def get_license_from_pypi(package):
    url = f"https://pypi.org/pypi/{package}/json"
    try:
        response = requests.get(url)
        if response.status_code != 200:
            return None, 'NOT FOUND'
        data = response.json()
        license = data['info'].get('license', '')
        classifiers = data['info'].get('classifiers', [])
        return license, classifiers
    except Exception as e:
        return None, str(e)

# Main check
def check_licenses():
    required_packages = get_required_packages()
    matching_licenses = {}
    non_open_source = []

    for pkg in required_packages:
        license, classifiers = get_license_from_pypi(pkg)
        license_str = license or "Unknown"

        # Match license name or classifier keywords
        is_open = any(
            oss.lower() in license_str.lower()
            or any(oss.lower() in c.lower() for c in classifiers)
            for oss in OPEN_SOURCE_LICENSES
        )

        matching_licenses[pkg] = {
            "license": license_str,
            "classifiers": classifiers,
            "is_open_source": is_open
        }

        if not is_open:
            non_open_source.append(pkg)

    # Save report
    with open('matching_licenses.json', 'w') as f:
        json.dump(matching_licenses, f, indent=2)

    # Output result
    if non_open_source:
        print("❌ Non-open source or unknown licenses found in:")
        for pkg in non_open_source:
            print(f"- {pkg}")
        sys.exit(1)
    else:
        print("✅ All python packages are open source.")

# Run
check_licenses()
