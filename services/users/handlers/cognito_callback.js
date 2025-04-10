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
                const url = new URL(state)
                loginRedirect = `${url.origin}/login`
            } catch (err) {
                console.warn('Invalid state URL, falling back to default login.')
            }
        }

        // Redirect if state or code is missing
        if (!state || !code || typeof code !== 'string' || code.length === 0) {
            console.warn('Missing or invalid state/code, redirecting to login.')
            return {
                statusCode: 302,
                headers: {
                    Location: `${loginRedirect}/pageNotFound`,
                    'Cache-Control': 'no-cache',
                },
                body: '',
            }
        }

        // Validate state URL format again (safe)
        let validatedUrl
        try {
            validatedUrl = new URL(state)
        } catch (err) {
            console.error('Error validating state URL:', err)
            return {
                statusCode: 302,
                headers: {
                    Location: `${loginRedirect}/pageNotFound`,
                    'Cache-Control': 'no-cache',
                },
                body: '',
            }
        }

        const secretKey = process.env.SUB_ENC_KEY
        if (!secretKey) {
            console.error('Missing SUB_ENC_KEY env variable')
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
        const frontendRedirectUrl = `${state}?code=${encodeURIComponent(encryptedCode)}`
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
