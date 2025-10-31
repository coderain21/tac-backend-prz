/* eslint-disable no-inner-declarations */
/* eslint-disable no-plusplus */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-shadow */
/* eslint-disable consistent-return */
/* eslint-disable no-useless-catch */
/* eslint-disable no-use-before-define */
/* eslint-disable no-unused-vars */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-promise-executor-return */
/* eslint-disable no-console */
const CryptoJS = require('crypto-js')
const uuid = require('uuid')
const AWS = require('aws-sdk')

const cognito = new AWS.CognitoIdentityServiceProvider()
const Subdomain = require('../entities/SubDomain')
const mongoConnection = require('../lib/mongodb_helper')

/* eslint-disable no-console */
exports.handler = async (event) => {
    let loginRedirect = `https://${process.env.DEFAULT_SUB_DOMAIN}.${process.env.AMPLIFY_DOMAIN_NAME}`
    try {
        const queryParams = event.queryStringParameters || {}
        const { state, code } = queryParams // Capture state (frontend URL) and auth code

        if (state) {
            try {
                // Try parsing as JSON first (federated login)
                const stateData = JSON.parse(decodeURIComponent(state))
                if (stateData.redirect_url) {
                    const url = new URL(stateData.redirect_url)
                    loginRedirect = `${url.origin}/login`
                }
            } catch (err) {
                // Fallback: treat as URL (normal login)
                try {
                    const url = new URL(state)
                    loginRedirect = `${url.origin}/login`
                } catch (urlErr) {
                    console.log('Invalid state format, falling back to default login.')
                }
            }
        }

        // Redirect if state or code is missing
        if (!state || !code || typeof code !== 'string' || code.length === 0) {
            console.log('Missing or invalid state/code, redirecting to login.')
            console.log(`${loginRedirect}/pageNotFound`)
            return {
                statusCode: 302,
                headers: {
                    Location: `${loginRedirect}/pageNotFound`,
                    'Cache-Control': 'no-cache',
                },
                body: '',
            }
        }

        // Parse state to get redirect URL
        let redirectUrl = state
        try {
            const stateData = JSON.parse(decodeURIComponent(state))
            redirectUrl = stateData.redirect_url || state
        } catch (err) {
            // Use state as-is if not JSON
        }

        const secretKey = process.env.SUB_ENC_KEY
        if (!secretKey) {
            console.log('Missing env variable')
            return {
                statusCode: 302,
                headers: {
                    Location: loginRedirect,
                    'Cache-Control': 'no-cache',
                },
                body: '',
            }
        }

        const encryptedCode = CryptoJS.AES.encrypt(code, secretKey).toString()
        const frontendRedirectUrl = `${redirectUrl}?code=${encodeURIComponent(encryptedCode)}`
        console.log('Redirecting to:', frontendRedirectUrl)

        return {
            statusCode: 302,
            headers: {
                Location: frontendRedirectUrl,
                'Cache-Control': 'no-cache',
            },
            body: '',
        }
    } catch (err) {
        console.error('Unexpected error:', err)
        return {
            statusCode: 302,
            headers: {
                Location: `${loginRedirect}/pageNotFound`,
                'Cache-Control': 'no-cache',
            },
            body: '',
        }
    }
}
