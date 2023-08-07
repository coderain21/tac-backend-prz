/* eslint-disable camelcase */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-console */
const crypto = require('crypto')
const Joi = require('joi')
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('request')
const passwordValidator = require('password-validator')
const Users = require('../entities/Users')
const mongoConnection = require('../lib/mongodb_helper')
const helpers = require('../lib/helper')

function encryptWithTimeValidation(data, secretKey) {
    const timestamp = Date.now().toString()
    const cipher = crypto.createCipher('aes-256-cbc', secretKey)
    let encryptedData = cipher.update(timestamp + JSON.stringify(data), 'utf8', 'hex')
    encryptedData += cipher.final('hex')
    return encryptedData
}

module.exports.verifyReCaptcha = async (event) => {
    try {
        const userData = JSON.parse(event.body)
        const connection = await mongoConnection.connect()
        const user_details = await Users.findOne({ email_address: userData.email_address})
        const decryptedPassword = await helpers.encryptDecryptPassword(user_details.password, false)
        if (decryptedPassword !== userData.current_password) {
            return {
                success: false,
                message: 'Please enter the correct password',
            }
        }
        // await connection.disconnect()
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
        const isPasswordValid = passwordSchema.validate(user_details.new_password)
        if (!isPasswordValid) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Invalid Password' }),
            }
        }
        if (user_details.new_password !== user_details.confirm_password)
        {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Password Doesnt match' }),
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
