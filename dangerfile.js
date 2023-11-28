/* eslint-disable security/detect-object-injection */
/* eslint-disable security/detect-unsafe-regex */
import { danger, warn, fail } from "danger"
const { execSync } = require("child_process");
// const prDescription = danger.bitbucket_cloud.pr.description;
const commits = danger.bitbucket_cloud.commits;
const cardNumberRegex = /\b[A-Za-z]+-\d+\b/;
const timeTagRegex = /#time \d+[hmdw]*/;
const Branchtype = /(feature:|bugfix:|hotfix:|chore:|refactor:|documentation:|style:|test:|performance:|ci:|build:|revert:)/;
let hasFailures = false;


let commitIndex = 0;
let foundCommitWithOneParent = false;

while (commitIndex < commits.length && !foundCommitWithOneParent) {
    const currentCommit = commits[commitIndex];
    const numberOfParents = currentCommit.parents.length;

    if (numberOfParents === 1) {
        foundCommitWithOneParent = true;
    } else {
        // Move to the next commit
        commitIndex++;
    }
}


if (foundCommitWithOneParent) {
    const latestCommit = commits[commitIndex];
    console.log(latestCommit,'latest commit')
    const commitHash = latestCommit.hash;
    console.log(`Found commit (${commitHash}) with one parent.`);
    const commitMessage = latestCommit.message;

    

    if (!cardNumberRegex.test(commitMessage)) {
        fail(`Latest commit (${commitHash}) is missing Jira issue key (e.g., CARD-1234)`);
        hasFailures = true;
    }
    if (!timeTagRegex.test(commitMessage)) {
        fail(`Latest commit (${commitHash}) is missing a #time tag (e.g., #time 2h)`);
        hasFailures = true;
    }
    if (!Branchtype.test(commitMessage)) {
        fail(`Latest commit (${commitHash}) is missing a Branch type (e.g., feature: or bugfix:)`);
        hasFailures = true;
    }
    // Continue with your logic for the found commit...
} else {
    console.log("No commit with one parent found.");
}


const branchNameRegex = /^(feature|bugfix|hotfix|chore|refactor|documentation|style|test|performance|ci|build|revert)\/\d+(\.\d+)?(\/\w+)*$/;

// Get the branch name from the BITBUCKET_BRANCH environment variable
const branchName = process.env.BITBUCKET_BRANCH;

if (!branchNameRegex.test(branchName)) {
    fail(`Jira fix version is missing in branch name: ${branchName}`);
    hasFailures = true;
}

if (hasFailures) {
    process.exit(1);
}