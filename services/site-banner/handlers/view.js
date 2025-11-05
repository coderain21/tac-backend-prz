/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */

const helpers = require('../lib/helper')
const SiteBanner = require('../entities/SiteBanner')
const mongodbHelper = require('../lib/mongodb_helper')

let connection = null
/**
 * View Site Banner Notification | Admin Site Banner Management
 * @description - API to view site banner notification
 * @route - GET /
 * @access - (Private)
 * @user - IndyAuction Admin
 * @returns {Object} (200) - View site banners notification
 * @returns {Error} (500) - There was an error while viewing notifications
 */
module.exports.handler = async (event) => {
    try {
        /** Establish database connection */
        if (connection === null || !connection.readyState) {
            connection = await mongodbHelper.connect()
        }
        /** Extract user and query parameters from the event */
        const audience = decodeURIComponent(event.pathParameters.audience)
        const query = {
            audience,
        }
        const projection = {
            type: 1, updated_at: 1, created_at: 1, audience: 1, notification: 1, _id: 0,
        }

        /** Fetch enterprises using the provided criteria */
        const notificationView = await SiteBanner.findOne(query, projection)

        if (!notificationView) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Site Banner Notification not found',
                }),
            }
        }

        // /** Return successful response with enterprise data and pagination info */
        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                data: notificationView,
            }),
        }
    } catch (error) {
        /** Log and handle errors */
        console.error('Error', error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'There was an error while viewing the notification',
            }),
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
