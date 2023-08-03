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

async function checkUserExists(username) {
    try {
        const params = {
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: username,
        }
        const userInfo = await cognito.adminGetUser(params).promise()
        if (userInfo.UserStatus === 'CONFIRMED') { return true }
        return false
    } catch (err) {
        if (err.code === 'UserNotFoundException') {
            console.log('User does not exist in Cognito')
            return false
        }
        console.log('Error checking user existence:', err)
        throw err
    }
}

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

    // throw new Error('Data has expired')
}
async function cognitoCreate(userData) {
    try {
        const attributeList = []
        attributeList.push(
            { Name: 'custom:is_first_time_login', Value: 'true' },
            { Name: 'custom:user_type', Value: userData.user_type },
            { Name: 'email', Value: userData.email_address },
        )
        console.log("userData", userData)
        const user = await cognitoIdentityServiceProvider
            .signUp({
                ClientId: userData.user_type === 'seller' ? process.env.COGNITO_SELLER_CLIENT_ID : process.env.COGNITO_BUYER_CLIENT_ID,
                Username: userData.email_address,
                Password: userData.password,
                UserAttributes: attributeList,
            })
            .promise()
        console.log('xxxxxxxxxxx', user)

        console.log('inside2')
        if (user) {
            const params = {
                UserPoolId: process.env.COGNITO_USER_POOL_ID,
                Username: userData.email_address,
            }
            await cognitoIdentityServiceProvider.adminConfirmSignUp(params).promise()
            await cognitoIdentityServiceProvider.adminAddUserToGroup({
                GroupName: userData.user_type,
                UserPoolId: process.env.COGNITO_USER_POOL_ID/* required */,
                Username: userData.email_address, /* required */
            }).promise()
            return {
                success_status: true,
                message: 'User added successfuly',
            }
        }
        return {
            success_status: false,
            message: 'There was an error while creating admin account',
        }
    } catch (error) {
        console.log(error)
        return {
            success_status: false,
            message: error.message,
        }
    }
}

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
                const data = await decryptWithTimeValidation(userData.session_token, process.env.CUSTOMER_SESSION_TOKEN_SECRET, 5000000)
                console.log('data', data)
                if (data === false) {
                    return {
                        statusCode: 400,
                        headers: await helpers.getHeaders(),
                        body: JSON.stringify({ message: 'Invalid session token' }),
                    }
                }
                userData = { ...userData, ...data }
                userData.unique_id = uuid.v1()
                if (parseInt(data.otp, 10) !== parseInt(userData.otp, 10)) {
                    return {
                        statusCode: 400,
                        headers: await helpers.getHeaders(),
                        body: JSON.stringify({ message: 'Invalid OTP' }),
                    }
                }
                delete userData.session
                const cognitoResponse = await cognitoCreate(userData)
                if (cognitoResponse.success_status !== true) {
                    return {
                        statusCode: 400,
                        headers: await helpers.getHeaders(),
                        body: JSON.stringify({ message: cognitoResponse.message }),
                    }
                }
                const connection = await mongoConnection.connect()
                const user = await mongoConnection.save(userData, Users)
                await connection.disconnect()
                await helpers.sendPinpointEmail(userData.email_address, 'shrinit.poojary@7edge.com', JSON.stringify({}), process.env.TEMPLATE_ARN_WELCOME_EMAIL)

                return {
                    statusCode: 201,
                    headers: await helpers.getHeaders(),
                    body: JSON.stringify({ message: 'Succes' }),
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
