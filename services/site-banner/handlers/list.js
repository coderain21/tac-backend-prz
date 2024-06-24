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
 * List Site Banner Notification | Admin Site Banner Management
 * @description - API to list all site banner notification
 * @route - GET /
 * @access - (Private)
 * @user - IndyAuction Admin
 * @returns {Object} (200) - List of site banners notification
 * @returns {Error} (500) - There was an error while listing notifications
 */
module.exports.handler = async (event) => {
    try {
        /** Establish database connection */
        if (connection === null || !connection.readyState) {
            connection = await mongodbHelper.connect()
        }
        /** Extract user and query parameters from the event */
        const { queryStringParameters: queryParams } = event

        /** Prepare MongoDB query conditions */
        const mongoose_query = {
        }

        /** Define default sorting */
        let theSort = {
            updated_at: -1,
        }
        /** Customize sorting based on query parameters */
        if (queryParams?.sort_by && queryParams?.sort_order) {
            const sort = {}
            sort[queryParams.sort_by] = queryParams.sort_order
            theSort = sort
        }

        /** Configure pagination and sorting options */
        const options = {
            page: parseInt(queryParams?.page, 10) || 1,
            limit: queryParams?.limit ? parseInt(queryParams.limit, 10) : 10,
            sort: theSort,
        }

        /** Define projection to exclude unnecessary fields */
        options.projection = {
            type: 1,
            audience: 1,
            notification: 1,
            created_at: 1,
            updated_at: 1,
        }
        console.log('mongoose_query', mongoose_query)

        /** Fetch enterprises using the provided criteria */
        const notificationList = await mongodbHelper.list(SiteBanner, mongoose_query, options)
        if (notificationList.docs.length <= 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Site Banner Notification not found',
                }),
            }
        }

        /** Return successful response with enterprise data and pagination info */
        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                data: notificationList.docs,
                pagination: {
                    total_pages: notificationList.totalPages,
                    limit: notificationList.limit,
                    total_records: notificationList.totalDocs,
                    next_page: notificationList.nextPage,
                    page: notificationList.page,
                },
            }),
        }
    } catch (error) {
        /** Log and handle errors */
        console.error(error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'There was an error while listing the notification list',
            }),
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
