/* eslint-disable no-restricted-syntax */
// this code takes only those packages from licenses.json which are present in package.json file
const fs = require('fs')

// Read package.json and licenses.json
const packageData = JSON.parse(fs.readFileSync('package.json'))
const licensesData = JSON.parse(fs.readFileSync('licenses.json'))

// Extract dependencies and devDependencies from package.json
const dependencies = Object.keys(packageData.dependencies || {})
const devDependencies = Object.keys(packageData.devDependencies || {})

// Combine dependencies and devDependencies
const allDependencies = [...dependencies, ...devDependencies]

// Filter and create a new object with matching dependencies
const matchingLicenses = {}
for (const dependency of allDependencies) {
    const dependencyName = dependency.split('@')[0] // Extract the package name without version
    const matchingLicenseKey = Object.keys(licensesData).find(
        (licenseKey) => licenseKey.split('@')[0] === dependencyName,
    )
    if (matchingLicenseKey) {
        matchingLicenses[matchingLicenseKey] = licensesData[matchingLicenseKey]
    }
}
// Write the matching licenses to a separate file
fs.writeFileSync('matching_licenses.json', JSON.stringify(matchingLicenses, null, 2))

function checkLicenses() {
    const data = JSON.parse(fs.readFileSync('matching_licenses.json'))

    const openSourceLicenses = [
        'MIT',
        'Apache',
        'BSD-2-Clause',
        'BSD-3-Clause',
        'ISC',
        'MPL',
        'MS-PL',
        'CDDL',
    ]

    const nonOpenSourcePackages = Object.entries(data)
        .filter(([_, pkg]) => !openSourceLicenses.some((license) => pkg.licenses.includes(license)))
        .map(([name]) => name)

    if (nonOpenSourcePackages.length > 0) {
        console.error('Non-open source licenses found in the following packages:')
        console.error(nonOpenSourcePackages.join('\n'))
        process.exit(1) // Exit with a non-zero status to fail the build
    } else {
        console.log('packages found are opensource!')
    }
}

checkLicenses()
