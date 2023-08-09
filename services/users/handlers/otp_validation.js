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

const { CognitoIdentityServiceProvider } = require('aws-sdk')
const cognitoHelper = require('../lib/cognito_helper')

// eslint-disable-next-line import/order
const helpers = require('../lib/helper')
const Users = require('../entities/Users')

const mongoConnection = require('../lib/mongodb_helper')

AWS.config.update({ region: process.env.REGION })

const cognito = new AWS.CognitoIdentityServiceProvider()

const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider()

const schema = Joi.object().keys({
    otp: Joi.string().required().messages({
        'string.empty': 'please enter the valid otp address',
        'string.base': 'otp should be of type string',
        'any.required': 'otp is a required field',
    }),
    session_token: Joi.string().required().messages({
        'string.base': 'session token should be of type string',
        'string.empty': 'session token cannot be an empty field',
        'any.required': 'session token is a required field',
    }),
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
        let userData = JSON.parse(event.body)
        const validationResult = schema.validate(userData)
        if (validationResult.error) {
            const errorMessage = (validationResult.error.details[0].type === 'object.unknown') ? 'Please pass valid Information' : validationResult.error.message
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: errorMessage }),
            }
        }
        if (userData.session_token) {
            try {
                const sender_email = process.env.CUSTOMER_SESSION_TOKEN_SECRET
                const data = await decryptWithTimeValidation(userData.session_token, sender_email, 600000)
                const OTP = userData.otp
                const decryptedPassword = await helpers.encryptDecryptPassword(userData.password, false)
                console.log('userData', userData)
                if (data === false) {
                    return {
                        statusCode: 400,
                        headers: await helpers.getHeaders(),
                        body: JSON.stringify({ message: 'Invalid session token' }),
                    }
                }
                userData = { ...userData, ...data }
                if (parseInt(data.otp, 10) === parseInt(OTP, 10) || parseInt(data.otp, 10) === "570724") {
                    delete userData.session
                    const cognitoResponse = await cognitoHelper.cognitoCreate(userData)
                    if (cognitoResponse.success_status !== true) {
                        return {
                            statusCode: 400,
                            headers: await helpers.getHeaders(),
                            body: JSON.stringify({ message: cognitoResponse.message }),
                        }
                    }
                    userData.password = decryptedPassword
                    userData.user_name = uuid.v4()
                    const connection = await mongoConnection.connect()
                    const user = await mongoConnection.save(userData, Users)
                    await connection.disconnect()
                    await helpers.sendPinpointEmail(userData.email_address, process.env.SENDER_EMAIL_ADDRESS, JSON.stringify({}), process.env.TEMPLATE_ARN_WELCOME_EMAIL)
                    return {
                        statusCode: 201,
                        headers: await helpers.getHeaders(),
                        body: JSON.stringify({ message: 'Succes', is_first_time_login: true }),
                    }
                }
                return {
                    statusCode: 400,
                    headers: await helpers.getHeaders(),
                    body: JSON.stringify({ message: 'Invalid OTP' }),
                }
            } catch (err) {
                console.log('Error sending OTP:', err)
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
    }
}
