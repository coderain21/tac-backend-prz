/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-console */
const crypto = require('crypto')
const Joi = require('joi')
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('request')
const { generate } = require('otp-generator')

const passwordValidator = require('password-validator')
const Users = require('../entities/Users')
const mongoConnection = require('../lib/mongodb_helper')

const helpers = require('../lib/helper')

const schema = Joi.object().keys({
    user_type: Joi.string().required().messages({
        'string.base': 'user type should be of type string',
        'string.empty': 'user type cannot be an empty field',
        'any.required': 'user type is a required field',
    }),
    email_address: Joi.string().email().required().messages({
        'string.empty': 'please enter the valid email address',
        'string.base': 'Email address should be of type string',
        'any.required': 'Email address is a required field',
    }),
    password: Joi.string().required().messages({
        'string.base': 'Password should be of type string',
        'string.empty': 'Password line 1 cannot be an empty field',
        'any.required': 'Password line 1 is a required field',
    }),
    confirm_password: Joi.string().required().messages({
        'string.base': 'confirm passowrd should be of type string',
        'string.empty': ' Confirm password cannot be an empty field',
        'any.required': 'confirm passwordis a required field',
    }),
    terms_and_condition: Joi.boolean().required().messages({
        'boolean.base': 'terms and condition should be of type boolean',
    }),
    newsletter_notification: Joi.boolean().optional().messages({
        'boolean.base': 'newsletter notification should be of type boolean',
    }),
    session_token: Joi.string().required().messages({
        'string.base': 'session token should be of type string',
        'string.empty': 'session token cannot be an empty field',
        'any.required': 'session token is a required field',
    }),
})
function encryptWithTimeValidation(data, secretKey) {
    const timestamp = Date.now().toString()
    const cipher = crypto.createCipher('aes-256-cbc', secretKey)
    let encryptedData = cipher.update(timestamp + JSON.stringify(data), 'utf8', 'hex')
    encryptedData += cipher.final('hex')
    return encryptedData
}
async function verifyReCaptcha(token) {
    try {
        const data = await new Promise((resolve, reject) => {
            request({
                method: 'POST',
                url: process.env.RECAPTCHA_URL,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `secret=${process.env.RECAPTCHA_KEY}&response=${token}`,
            }, (error, response, body) => {
                if (error) {
                    console.log('err', error)
                    reject(error)
                } else {
                    console.log(body)
                    resolve(body)
                }
            })
        })
        return data
    } catch (err) {
        return {
            success_status: false,
        }
    }
}

module.exports.verifyReCaptcha = async (event) => {
    try {
        const userData = JSON.parse(event.body)
        const validationResult = schema.validate(userData)
        if (validationResult.error) {
            const errorMessage = (validationResult.error.details[0].type === 'object.unknown') ? 'Please pass valid Information' : validationResult.error.message
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: errorMessage }),
            }
        }
        const connection = await mongoConnection.connect()
        const userExist = await Users.findOne({ email_address: userData.email_address, user_type: userData.user_type })
        if (userExist) {
            return {
                statusCode: 409,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'An account linked to this already exists' }),
            }
        }
        await connection.disconnect()
        if (userData.password !== userData.confirm_password) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Password Doesnt match' }),
            }
        }
        // eslint-disable-next-line new-cap
        const passwordSchema = new passwordValidator()
        // Add password validation rules
        passwordSchema
            .is().min(8) // Minimum length 8 characters
            .has().uppercase()
            .is()
            .max(100) // Maximum length 100 characters
            .has()
            .lowercase() // Must have at least one lowercase letter
            .has()
            .digits() // Must have at least one digit
            .has()
            .symbols() // Must have at least one symbol
        // Validate the password
        const isPasswordValid = passwordSchema.validate(userData.password)
        if (!isPasswordValid) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Invalid Password' }),
            }
        }
        const captchaResult = await verifyReCaptcha(userData.session_token)
        userData.otp = generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false })
        if (captchaResult.success === false) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Captcha verification failed' }),
            }
        }
        userData.free_user = true
        const encryptedData = await encryptWithTimeValidation(userData, process.env.CUSTOMER_SESSION_TOKEN_SECRET)
        await helpers.sendPinpointEmail(userData.email_address, process.env.SENDER_EMAIL_ADDRESS, JSON.stringify({ otp: userData.otp }), process.env.TEMPLATE_ARN_EMAIL_OTP)
        return {
            statusCode: 201,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ encrypted_token: encryptedData }),
        }
    } catch (error) {
        console.log(error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: error.message }),
        }
    }
}
