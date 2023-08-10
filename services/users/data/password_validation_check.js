/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const helpers = require('../lib/helper')

module.exports.validationCheck = async (oldPassword, userData) => {
    try {
        if (oldPassword !== userData.current_password) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Current password is incorrect. The password update cannot be completed.' }),
            }
        } if (userData.new_password === oldPassword) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'New password matches current password. Please choose a different password.' }),
            }
        } if (userData.new_password !== userData.confirm_password) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Confirmed password does not match the new password' }),
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
