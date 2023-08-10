/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const helpers = require('../lib/helper')

module.exports.validationCheck = async (oldPassword, userData) => {
    try {
        if (oldPassword !== userData.current_password) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Incorrect password' }),
            }
        } if (userData.new_password === oldPassword) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'New password cannot be the same as old password. Please try again. ' }),
            }
        } if (userData.new_password !== userData.confirm_password) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Passwords do not match' }),
            }
        }
        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'SUCCESS' }),
        }
    } catch (err) {
        return {
            statusCode: 400,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'Something went wrong.Please try again.' }),
        }
    }
}
