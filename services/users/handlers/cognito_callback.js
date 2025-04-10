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
    try {
        const queryParams = event.queryStringParameters || {}
        const { state, code } = queryParams // Capture state (frontend URL) and auth code

        if (!state || !code) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Missing state or code' }),
                headers: { 'Content-Type': 'application/json' },
            }
        }

        // Validate code format
        if (typeof code !== 'string' || code.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid code format' }),
                headers: { 'Content-Type': 'application/json' },
            }
        }

        // Validate state URL format
        try {
            const validatedUrl = new URL(state)
            if (!validatedUrl.protocol || !validatedUrl.host) {
                throw new Error('Invalid URL')
            }
        } catch (err) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid state URL format' }),
                headers: { 'Content-Type': 'application/json' },
            }
        }

        const secretKey = 'INDY_SUBDOMAIN' || 'default-secret-key'
        const encryptedCode = CryptoJS.AES.encrypt(code, secretKey).toString()
        // const getSub = (state) => {
        //     const url = new URL(state)
        //     const hostParts = url.hostname.split('.')
        //     // Check if hostname has at least 3 parts (subdomain.domain.tld)
        //     if (hostParts.length >= 3) {
        //         return hostParts[0]
        //     }
        //     return null
        // }

        // // Add subdomain extraction to handler
        // const subd = getSub(state)
        // if (!subd) {
        //     return {
        //         statusCode: 400,
        //         body: JSON.stringify({ message: 'Invalid subdomain in state URL' }),
        //         headers: { 'Content-Type': 'application/json' },
        //     }
        // }
        // const query = { subdomain: subd }
        // const domain = await mongoConnection.getSubdomain(query, Subdomain)
        // console.log('sub', domain)

        // if (!domain) {
        //     return {
        //         statusCode: 400,
        //         body: JSON.stringify({ message: 'Invalid subdomain in state URL' }),
        //         headers: { 'Content-Type': 'application/json' },
        //     }
        // }


        // Ensure the redirect URL is clean
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
        console.log('Error:', err)
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal Server Error' }),
            headers: { 'Content-Type': 'application/json' },
        }
    }
}
