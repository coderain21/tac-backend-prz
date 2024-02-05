/* eslint-disable security/detect-object-injection */
/* eslint-disable security/detect-unsafe-regex */
import { danger, warn, fail } from 'danger'

const { execSync } = require('child_process')
// const prDescription = danger.bitbucket_cloud.pr.description;
const { commits } = danger.bitbucket_cloud
const cardNumberRegex = /\b[A-Za-z]+-\d+\b/
const timeTagRegex = /#time \d+[hmdw]*/
const Branchtype = /(feature:|bugfix:|hotfix:|chore:|refactor:|documentation:|style:|test:|performance:|ci:|build:|revert:)/
let hasFailures = false
const emailRegex = /<([^>]+?)>/
// Check if any commit has an email without "@7edge.com" before entering the loop
const shouldSkipLoop = commits.some((commit) => {
    const authorRaw = commit.author.raw
    const match = emailRegex.exec(authorRaw)
    console.log(match, 'raw')
    return match && !match[1].includes('@7edge.com')
})

if (shouldSkipLoop) {
    console.log('Skipping the loop for commits with email addresses not from @7edge.com')
} else {
    for (const commit of commits) {
        const numberOfParents = commit.parents.length
        if (numberOfParents === 1) {
            const commitHash = commit.hash
            console.log(`Checking commit (${commitHash}) with one parent.`)
            const commitMessage = commit.message

            if (!cardNumberRegex.test(commitMessage)) {
                fail(`Commit (${commitHash}) is missing Jira issue key (e.g., CARD-1234)`)
                hasFailures = true
            }

            if (!timeTagRegex.test(commitMessage)) {
                fail(`Commit (${commitHash}) is missing a #time tag (e.g., #time 2h)`)
                hasFailures = true
            }

            if (!Branchtype.test(commitMessage)) {
                fail(`Commit (${commitHash}) is missing a Branch type (e.g., feature: or bugfix:)`)
                hasFailures = true
            }
        }
    }
}

const branchNameRegex = /\/(\d+\.\d+)\//

// Get the branch name from the BITBUCKET_BRANCH environment variable
const branchName = process.env.BITBUCKET_BRANCH

if (!branchNameRegex.test(branchName)) {
    fail(`Jira fix version is missing in branch name: ${branchName}`)
    hasFailures = true
}
if (hasFailures) {
    process.exit(1);
}

