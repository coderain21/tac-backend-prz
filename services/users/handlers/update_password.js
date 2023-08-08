/* eslint-disable camelcase */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-console */
const CryptoJS = require('crypto-js')
const { validationCheck } = require('../data/password_validation_check')
const Users = require('../entities/Users')
const mongoConnection = require('../lib/mongodb_helper')
const helpers = require('../lib/helper')
const cognitoHelper = require('../lib/cognito_helper')

module.exports.updatePassword = async (event) => {
    try {
        const userData = JSON.parse(event.body)
        const email = decodeURIComponent(event.pathParameters.email)
        const connection = await mongoConnection.connect()
        const get_user = await mongoConnection.view(Users, { email_address: email })
        console.log('get', get_user)
        const user_old_password = get_user[0].password
        const bytes = CryptoJS.AES.decrypt(user_old_password, process.env.PASSWORD_SECRET_KEY)
        const old_password = bytes.toString(CryptoJS.enc.Utf8)
        const conditionCheck = await validationCheck(old_password, userData)
        if (conditionCheck.statusCode !== 200) {
            return conditionCheck
        }
        const request_body = {
            password: CryptoJS.AES.encrypt(userData.new_password, process.env.PASSWORD_SECRET_KEY).toString(),
        }
        const update_user_information = await mongoConnection.update(Users, get_user[0]._id, request_body)
        console.log('update_user_information', update_user_information)
        await connection.disconnect()
        if (update_user_information.modifiedCount > 0) {
            userData.email = email
            const cognito_update = await cognitoHelper.cognitoResetPassword(userData)
            console.log('cognito', cognito_update)
            return {
                statusCode: 201,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Password updated successfully' }),
            }
        }
        return {
            statusCode: 400,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'Password not updated.Please try again.' }),
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
