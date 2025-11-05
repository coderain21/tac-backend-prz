/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */

const helpers = require('../lib/helper')
const BidInformation = require('../entities/BidInformation')
const mongodbHelper = require('../lib/mongodb_helper')

let connection
/**
 * List Bidders | Admin Buyer Bid History
 * @description - API to list all buyers bids
 * @route - GET /{lot_id}
 * @access - (Private)
 * @user - IndyAuction Admin
 * @returns {Object} (200) - List of bids
 * @returns {Error} (500) - There was an error while listing bids
 */
module.exports.handler = async (event) => {
    try {
        /** Establish database connection */
        connection = await mongodbHelper.connect()
        const emailAddress = decodeURIComponent(event.pathParameters.email_address)
        /** Extract user and query parameters from the event */
        const { queryStringParameters: queryParams } = event

        /** Prepare MongoDB query conditions */
        const mongoose_query = {
            $and: [],
        }

        /** Define default sorting */
        let theSort = {
            paddle_number: -1,
        }
        /** Customize sorting based on query parameters */
        if (queryParams?.sort_by && queryParams?.sort_order) {
            const sort = {}
            sort[queryParams.sort_by] = queryParams.sort_order
            theSort = sort
        }

        /** Apply date range filter if start_date is provided */
        if (queryParams?.start_date) {
            mongoose_query.$and.push({
                time_stamp: {
                    $gte: parseInt(queryParams.start_date, 10),
                    $lte: parseInt(queryParams.end_date, 10),
                },
            })
        }
        /** Configure pagination and sorting options */
        const options = {
            page: parseInt(queryParams?.page, 10) || 1,
            limit: queryParams?.limit ? parseInt(queryParams.limit, 10) : 10,
            sort: theSort,
        }

        /** Apply additional conditions */
        mongoose_query.$and.push({ email_address: emailAddress })
        // mongoose_query.$and.push({ deleted: false })

        /** Define projection to exclude unnecessary fields */
        options.projection = {
            paddle_number: 1,
            name: 1,
            bid_amount: 1,
            auction_title: 1,
            lot_number: 1,
            time_stamp: 1,
            bid_status: 1,
            lot_title: 1,
            buyer_id: 1,
            currency: 1,
            time_zone: 1,
            lot_image: 1,
        }

        /** Fetch enterprises using the provided criteria */
        const bidsList = await mongodbHelper.list(BidInformation, mongoose_query, options)
        if (bidsList.docs.length <= 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Bids not found',
                }),
            }
        }

        /** Return successful response with enterprise data and pagination info */
        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                data: bidsList.docs,
                pagination: {
                    total_pages: bidsList.totalPages,
                    limit: bidsList.limit,
                    total_records: bidsList.totalDocs,
                    next_page: bidsList.nextPage,
                    page: bidsList.page,
                },
            }),
        }
    } catch (error) {
        /** Log and handle errors */
        console.error('Error', error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'There was an error while listing the enterprises',
            }),
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
