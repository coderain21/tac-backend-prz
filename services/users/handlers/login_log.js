/* eslint-disable camelcase */
/* eslint-disable consistent-return */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-console */

const mongodbHelper = require('../lib/mongodb_helper')
const helpers = require('../lib/helper')
const Users = require('../entities/Users')
const AccessLogs = require('../entities/AccessLogs')

let connection = null

function getFullname(nameObject) {
    const fname = nameObject.fname.trim()
    const lname = nameObject.last.trim()

    if (fname && lname) {
        return `${fname} ${lname}`
    } if (fname) {
        return fname
    } if (lname) {
        return lname
    }
    return ''
}

/**
 * The function which call after seller signin to save the logs
 * @param body - {object}
 * @returns {Object} (201) - Saved Successfully
 * @returns {Error} (500) - There was an error while updating seller status
 */

module.exports.handler = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            console.log('not coonected')
            connection = await mongodbHelper.connect()
        }
        const payload = JSON.parse(event.body)

        const emailAddress = event.requestContext.authorizer.claims['cognito:username']
        const getSeller = await mongodbHelper.getUser({ email_address: emailAddress }, Users)
        payload.updated_by.email_address = emailAddress
        const fullName = getFullname(getSeller[0])
        const access_logs = {
            actor_id: getSeller[0].seller_id,
            updated_by: {
                type: 'Seller',
                name: fullName,
                email_address: emailAddress,
            },
            section: {
                name: 'Seller Management',
                action: 'Login',
                user_id: emailAddress,
            },
        }
        const saveHistory = await mongodbHelper.save(access_logs, AccessLogs)
        if (saveHistory) {
            return {
                statusCode: 201,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Logs saved successfully',
                }),
            }
        }

        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'There was an error saving the logs',
            }),
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
