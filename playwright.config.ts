import { defineConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// Load test interface and service name from environment variables (set by shell script)
const selectedInterface = process.env.TEST_DIR // 
const selectedService = process.env.SERVICE    // 

const testRootDir = 'test/'
const basePath = selectedInterface ? `${testRootDir}${selectedInterface}` : testRootDir

/**
 * Recursively walks through the directory tree starting from `baseDir`,
 * and collects test directories that match the given service name, if provided.
 * If no matching directory is found for the service, it falls back to collecting all test directories.
 */
function findTestDirs(baseDir: string, serviceFilter?: string): { name: string, testDir: string }[] {
    const testDirs: { name: string, testDir: string }[] = []

    function walk(currentPath: string) {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true })

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name)

            if (entry.isDirectory()) {
                const relativePath = path.relative(testRootDir, fullPath)
                const normalizedRelativePath = relativePath.replace(/\\/g, '/')

                // Include only directories ending in "test-<service>" if a filter is applied,
                // otherwise include everything
                const shouldInclude = !serviceFilter || normalizedRelativePath.endsWith(`test-${serviceFilter}`)

                if (shouldInclude) {
                    testDirs.push({
                        name: normalizedRelativePath,
                        testDir: fullPath,
                    })
                }

                // Continue walking into subdirectories
                walk(fullPath)
            }
        }
    }

    // First attempt to walk and collect based on service filter
    walk(baseDir)

    // If a filter was applied but no directories matched, fallback to collecting all test directories
    if (serviceFilter && testDirs.length === 0) {
        return findTestDirs(baseDir) // Retry without service filter
    }

    return testDirs
}

// Get test directories to run
const testDirs = findTestDirs(basePath, selectedService)

// Export Playwright config with matched projects
export default defineConfig({
    timeout: 30000,
    expect: { timeout: 5000 },
    fullyParallel: true,
    workers: 2,
    reporter: [['junit', { outputFile: 'results.xml' }]],
    projects: testDirs,
})
