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
const Users = require('../entities/Buyers')
const Counter = require('../entities/Counter')
const mongoConnection = require('../lib/mongodb_helper')
const helpers = require('../lib/helper')



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
            new URL(state)
        } catch (err) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid state URL format' }),
                headers: { 'Content-Type': 'application/json' },
            }
        }

        // Ensure the redirect URL is clean
        const frontendRedirectUrl = `${state}?code=${encodeURIComponent(code)}`
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
    } finally {
        if (client) {
            await client.close()
        }
    }
}

