/* eslint-disable camelcase */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-console */
const CryptoJS = require('crypto-js')
const { validationCheck } = require('../data/password_validation_check')
const Users = require('../entities/Users')
const AccessLogs = require('../entities/AccessLogs')
const mongoConnection = require('../lib/mongodb_helper')
const helpers = require('../lib/helper')
const cognitoHelper = require('../lib/cognito_helper')

let connection = null

function getFullname(nameObject) {
    const fname = nameObject.first_name.trim()
    const lname = nameObject.last_name.trim()

    if (fname && lname) {
        return `${fname} ${lname}`
    } if (fname) {
        return fname
    } if (lname) {
        return lname
    }
    return ''
}

/* The code you provided is a JavaScript function that exports a function called `updatePassword`. This
function is intended to be used as a handler for an AWS Lambda function. */
module.exports.updatePassword = async (event) => {
    try {
        const userData = JSON.parse(event.body)
        if (connection === null || !connection.readyState) {
            console.log('not coonected')
            connection = await mongoConnection.connect()
        }
        const email = decodeURIComponent(event.pathParameters.email)
        const get_user = await mongoConnection.view(Users, { email_address: email })
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
        const fullName = getFullname(get_user[0])
        const access_logs = {
            actor_id: get_user[0].seller_id,
            updated_by: {
                type: 'Seller',
                name: fullName,
                email_address: email,
            },
            section: {
                name: 'Seller Management',
                action: 'Update Password',
                user_id: email,
            },
        }
        await mongoConnection.save(access_logs, AccessLogs)
        if (update_user_information.modifiedCount > 0) {
            userData.email = email
            await cognitoHelper.cognitoResetPassword(userData)
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
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
