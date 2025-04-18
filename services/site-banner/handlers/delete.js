/* eslint-disable consistent-return */
/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
const helpers = require('../lib/helper')
const mongodbHelper = require('../lib/mongodb_helper')
const SiteBanner = require('../entities/SiteBanner')

let connection = null

module.exports.handler = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            connection = await mongodbHelper.connect()
        }

        const { notification_id: notificationId } = event.pathParameters

        if (!notificationId) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Notification ID is required' }),
            }
        }

        const notification = await SiteBanner.findOne({ _id: notificationId })

        if (!notification) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Notification not found' }),
            }
        }

        const deleteNotification = await SiteBanner.findOneAndDelete(
            { _id: notificationId },
        )

        if (deleteNotification) {
            return {
                statusCode: 200,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Notification deleted successfully' }),
            }
        }
    } catch (err) {
        console.log('Error:', err)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'Internal server error' }),
        }
    } finally {
        if (connection) {
            await connection.disconnect()
        }
    }
}
