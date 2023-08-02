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

const helpers = require('../lib/helper')

const schema = Joi.object().keys({
    email_address: Joi.string().required().messages({
        'string.base': 'Email address should be of type string',
        'string.empty': 'Email address cannot be an empty field',
        'any.required': 'Email address is a required field',
    }),
    password: Joi.string().required().messages({
        'string.base': 'Password should be of type string',
        'string.empty': 'Address line 1 cannot be an empty field',
        'any.required': 'Address line 1 is a required field',
    }),
    confirm_password: Joi.string().required().messages({
        'string.base': 'confirm passowrd should be of type string',
        'string.empty': 'Address line 2 cannot be an empty field',
        'any.required': 'Address line 2 is a required field',
    }),
    terms_and_condition: Joi.boolean().required().messages({
        'boolean.base': 'terms and condition should be of type boolean',
    }),
    newsletter_notification: Joi.boolean().required().messages({
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
        console.log('inside', `secret=${process.env.RECAPTCHA_KEY}&response=${token}`)
        const data = await new Promise((resolve, reject) => {
            request({
                method: 'POST',
                url: 'https://www.google.com/recaptcha/api/siteverify',
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

        console.log('data111111111', data)
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
        console.log('zzzzzzzzzzzz', process.env.RECAPTCHA_KEY)
        const captchaResult = await verifyReCaptcha(userData.session_token)
        userData.otp = generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false })

        if (!captchaResult.success_status) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Captcha verification failed' }),
            }
        }
        console.log('userData', userData)
        const encryptedData = await encryptWithTimeValidation(userData, process.env.CUSTOMER_SESSION_TOKEN_SECRET)
        console.log('encryptedData', encryptedData)
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
