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
const mongoConnection = require('../lib/mongodb_helper')

exports.handler = async (event) => {
    let loginRedirect = `https://${process.env.DEFAULT_SUB_DOMAIN}.${process.env.AMPLIFY_DOMAIN_NAME}`
    try {
        const queryParams = event.queryStringParameters || {}
        const { state, code, error } = queryParams

        // Handle OAuth errors first
        if (error) {
            console.log('OAuth error:', error, queryParams.error_description)
            return {
                statusCode: 302,
                headers: { Location: `${loginRedirect}/pageNotFound` },
                body: '',
            }
        }

        let stateData = null
        if (state) {
            try {
                // Handle double-encoded JSON by unescaping
                let decodedState = decodeURIComponent(state)
                decodedState = decodedState.replace(/\\\"/g, '"') // Fix escaped quotes

                if (decodedState.startsWith('{') || decodedState.startsWith('[')) {
                    stateData = JSON.parse(decodedState)
                    if (stateData.redirect_url) {
                        const url = new URL(stateData.redirect_url)
                        loginRedirect = `${url.origin}/login`
                    }
                }
            } catch (err) {
                console.log('Failed to parse state:', err.message)
                // Treat as plain URL if JSON parsing fails
                try {
                    const url = new URL(decodeURIComponent(state))
                    loginRedirect = `${url.origin}/login`
                } catch (urlErr) {
                    console.log('Invalid state format')
                }
            }

            // Store auction context using auth code as key
            if (stateData?.auction_id && code) {
                try {
                    await mongoConnection.createOrder(
                        process.env.MONGO_CLIENT,
                        process.env.DATABASE,
                        'temp_federated_auth',
                        {
                            auth_code: code,
                            auction_id: stateData.auction_id,
                            email_address: stateData.email_address,
                            created_at: new Date(),
                            expires_at: new Date(Date.now() + 10 * 60 * 1000),
                        },
                    )
                    console.log('Stored auction context for code:', code)
                } catch (err) {
                    console.error('Failed to store auction context:', err)
                }
            }
        }

        if (!state || !code) {
            return {
                statusCode: 302,
                headers: { Location: `${loginRedirect}/pageNotFound` },
                body: '',
            }
        }

        const redirectUrl = stateData?.redirect_url || state
        const encryptedCode = CryptoJS.AES.encrypt(code, process.env.SUB_ENC_KEY).toString()
        const frontendRedirectUrl = `${redirectUrl}?code=${encodeURIComponent(encryptedCode)}`

        return {
            statusCode: 302,
            headers: { Location: frontendRedirectUrl },
            body: '',
        }
    } catch (err) {
        console.error('Handler error:', err)
        return {
            statusCode: 302,
            headers: { Location: `${loginRedirect}/pageNotFound` },
            body: '',
        }
    }
}
