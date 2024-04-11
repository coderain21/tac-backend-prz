/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-console */
const crypto = require('crypto')
const { generate } = require('otp-generator')
const Users = require('../entities/Users')
const mongoConnection = require('../lib/mongodb_helper')
const helpers = require('../lib/helper')

let connection = null

/**
 * The function encrypts data with a secret key and includes a timestamp for time validation.
 * @param data - The `data` parameter is the data that you want to encrypt. It can be any type of data,
 * such as a string, object, or array.
 * @param secretKey - The `secretKey` parameter is a string that is used as the encryption key for the
 * data. It should be a secure and unique key that is known only to the sender and receiver of the
 * encrypted data.
 * @returns the encrypted data as a hexadecimal string.
 */
function encryptWithTimeValidation(data, secretKey) {
    const timestamp = Date.now().toString()
    const cipher = crypto.createCipher('aes-256-cbc', secretKey)
    let encryptedData = cipher.update(timestamp + JSON.stringify(data), 'utf8', 'hex')
    encryptedData += cipher.final('hex')
    return encryptedData
}

module.exports.generate_otp = async (event) => {
    try {
        const userData = JSON.parse(event.body)
        if (connection === null || !connection.readyState) {
            console.log('not coonected')
            connection = await mongoConnection.connect()
        }

        const userExist = await Users.findOne({ email_address: userData.email_address, user_type: userData.user_type })
        if (!userExist || !userData) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'An admin user does not exist.' }),
            }
        }
        userData.otp = generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false })
        const encryptedData = await encryptWithTimeValidation(userData, process.env.CUSTOMER_SESSION_TOKEN_SECRET)

        await helpers.sendPinpointEmail(userData.email_address, process.env.SES_SENDER_EMAIL_ID, JSON.stringify({ otp: userData.otp }), process.env.TEMPLATE_ARN_EMAIL_OTP)
        return {
            statusCode: 200,
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
