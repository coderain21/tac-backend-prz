/* eslint-disable import/extensions */
/* eslint-disable no-console */
/* eslint-disable camelcase */
/* eslint-disable import/no-unresolved */

const mongoConnection = require('../lib/mongodb_helper')
const CustomerData = require('../entities/Customer')
const helper = require('../lib/helper')


/**
 * Function to handle cognito pre challenge event
 * @param {Object} event
 * @param {Object} _context
 * @param {Object} callback
 * @returns returns event object
 */
exports.handler = async (event) => {
    try {
        console.log('event', event)
        const eventData = event

        const connection = await mongoConnection.connect()
        const collection = connection.db(process.env.MONGODB_NAME).collection(process.env.MONGODB_COLLECTION_NAME)
        const encryptedPassword = await helper.encryptDecryptPassword( eventData.request.userAttributes['custom:password'], false)
        newAdminData.is_first_time_login = true
        const user = await mongoConnection.save({
            email: eventData.request.userAttributes['email'],
            password: encryptedPassword,
            terms_and_conditions: eventData.request.userAttributes['custom:terms_and_conditions'],
            is_first_time_login: true,
            newsletter: eventData.request.userAttributes['custom:newsletter'],
        }, CustomerData)
        await connection.disconnect()
        if (!user) {
            return { success_status: false, message: 'There was an error while creating the usser' }
        }
        await connection.disconnect()
        const result = await collection.insertOne(userInformation)
        if (!result.acknowledged) {
            return { success_status: false, message: 'There was an error while creating the user' }
        }

        return event
    } catch (error) {
        console.log('error', error)
        throw new Error('Invalid Credentials')
    }
}
