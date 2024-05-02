/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable camelcase */
/* eslint-disable no-unused-vars */
const crypto = require('crypto')
const AWS = require('aws-sdk')
const uuid = require('uuid')
const Joi = require('joi')
const CryptoJS = require('crypto-js')

const { CognitoIdentityServiceProvider } = require('aws-sdk')
const cognitoHelper = require('../lib/cognito_helper')

// eslint-disable-next-line import/order
const helpers = require('../lib/helper')
const Users = require('../entities/Users')
const SubDomain = require('../entities/SubDomain')

const mongoConnection = require('../lib/mongodb_helper')

AWS.config.update({ region: process.env.REGION })

const cognito = new AWS.CognitoIdentityServiceProvider()

const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider()

let connection = null

const createGroup = async (username, userPoolId) => {
    try {
        const response = await cognito.createGroup({
            GroupName: username,
            UserPoolId: userPoolId,
        }).promise()
        console.log('Group created:', response)
    } catch (error) {
        console.error('Error creating group:', error)
    }
}

const schema = Joi.object().keys({
    otp: Joi.string().required().messages({
        'string.empty': 'please enter the valid otp address',
        'string.base': 'otp should be of type string',
        'any.required': 'otp is a required field',
    }),
    session_token: Joi.string().optional().allow(''),
    type: Joi.string().optional().allow(''),
})

AWS.config.update({ region: process.env.REGION })

async function decryptWithTimeValidation(encryptedData, secretKey, maxAge) {
    try {
        const decipher = crypto.createDecipher('aes-256-cbc', secretKey)
        let decryptedData = decipher.update(encryptedData, 'hex', 'utf8')
        decryptedData += decipher.final('utf8')
        const timestamp = decryptedData.slice(0, 13)
        const encryptedPayload = JSON.parse(decryptedData.slice(13))
        if (Date.now() - parseInt(timestamp, 10) <= maxAge) {
            return encryptedPayload
        }
        return false
    } catch (error) {
        console.log(error)
        return false
    }
}

/* The `module.exports.otpValidation` function is the main function that handles the OTP validation
process. It is an asynchronous function that takes in three parameters: `event`, `_context`, and
`callback`. */
module.exports.otpValidation = async (event, _context, callback) => {
    try {
        if (connection === null || !connection.readyState) {
            console.log('not coonected')
            connection = await mongoConnection.connect()
        }
        let userData = JSON.parse(event.body)
        const validationResult = schema.validate(userData)
        if (validationResult.error) {
            const errorMessage = (validationResult.error.details[0].type === 'object.unknown') ? 'Please pass valid Information' : validationResult.error.message
            console.log(errorMessage)
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: errorMessage }),
            }
        }
        // if (userData.type === 'admin' && userData.session_token === '') {
        //     try {
        //         const sender_email = process.env.CUSTOMER_SESSION_TOKEN_SECRET
        //         const data = await decryptWithTimeValidation(userData.session_token, sender_email, 600000)
        //         const OTP = userData.otp
        //         userData = { ...userData, ...data }
        //         if (parseInt(data.otp, 10) === parseInt(OTP, 10) || (process.env.STAGE !== 'prod' && OTP === '573421')) {
        //             return {
        //                 statusCode: 201,
        //                 headers: await helpers.getHeaders(),
        //                 body: JSON.stringify({ message: 'Succes' }),
        //             }
        //         }
        //         return {
        //             statusCode: 400,
        //             headers: await helpers.getHeaders(),
        //             body: JSON.stringify({ message: 'Invalid OTP' }),
        //         }
        //     } catch (err) {
        //         return {
        //             statusCode: 400,
        //             headers: await helpers.getHeaders(),
        //             body: JSON.stringify({ message: 'Something went wrong' }),
        //         }
        //     }
        // }
        if (userData.session_token !== '') {
            try {
                const sender_email = process.env.CUSTOMER_SESSION_TOKEN_SECRET
                const data = await decryptWithTimeValidation(userData.session_token, sender_email, 600000)
                const OTP = userData.otp
                if (data === false) {
                    return {
                        statusCode: 400,
                        headers: await helpers.getHeaders(),
                        body: JSON.stringify({ message: 'Invalid session token' }),
                    }
                }
                userData = { ...userData, ...data }
                if (parseInt(data.otp, 10) === parseInt(OTP, 10) || (process.env.STAGE !== 'prod' && OTP === '573421')) {
                    delete userData.session
                    const cognitoResponse = await cognitoHelper.cognitoCreate(userData)
                    if (cognitoResponse.success_status !== true) {
                        return {
                            statusCode: 400,
                            headers: await helpers.getHeaders(),
                            body: JSON.stringify({ message: cognitoResponse.message }),
                        }
                    }
                    const ciphertext = CryptoJS.AES.encrypt(userData.password, process.env.PASSWORD_SECRET_KEY).toString()
                    userData.password = ciphertext
                    const user = await mongoConnection.save(userData, Users)
                    const domainInfo = {
                        seller_email: userData.email_address,
                        subdomain: process.env.DEFAULT_SUB_DOMAIN,
                        default: true,
                        client_id: process.env.DEFAULT_CLIENT_ID,
                        group_name: userData.email_address.split('@')[0],
                    }
                    const domain = await mongoConnection.save(domainInfo, SubDomain)
                    await createGroup(userData.email_address.split('@')[0], process.env.DEFAULT_USERPOOL_ID)
                    const template_data = {
                        url: process.env.DASHBOARD_URL,
                    }
                    await helpers.sendPinpointEmail(userData.email_address, process.env.SES_SENDER_EMAIL_ID, JSON.stringify(template_data), process.env.TEMPLATE_ARN_WELCOME_EMAIL)

                    return {
                        statusCode: 201,
                        headers: await helpers.getHeaders(),
                        body: JSON.stringify({ message: 'Succes' }),
                    }
                }
                return {
                    statusCode: 400,
                    headers: await helpers.getHeaders(),
                    body: JSON.stringify({ message: 'Invalid OTP' }),
                }
            } catch (err) {
                return {
                    statusCode: 400,
                    headers: await helpers.getHeaders(),
                    body: JSON.stringify({ message: 'Something went wrong' }),
                }
            }
        }
        return {
            statusCode: 400,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'Invalid request' }),
        }
    } catch (err) {
        console.log('Error:', err)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: err.message }),
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
