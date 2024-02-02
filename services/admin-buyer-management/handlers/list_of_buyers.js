/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */

const helpers = require('../lib/helper')
const RegisteredUser = require('../entities/RegisteredUser')
const mongodbHelper = require('../lib/mongodb_helper')

let connection
/**
 * List Bidders | Admin Buyers list
 * @description - API to list all buyers
 * @route - GET /{auction_id}/{seller_email}
 * @access - (Private)
 * @user - IndyAuction Admin
 * @returns {Object} (200) - List of buyers
 * @returns {Error} (500) - There was an error while listing buyers
 */
module.exports.handler = async (event) => {
    try {
        /** Establish database connection */
        connection = await mongodbHelper.connect()
        const emailAddress = decodeURIComponent(event.pathParameters.seller_email)
        const auctionId = decodeURIComponent(event.pathParameters.auction_id)
        /** Extract user and query parameters from the event */
        const { queryStringParameters: queryParams } = event

        /** Prepare MongoDB query conditions */
        const mongoose_query = {
            $and: [],
        }

        /** Define default sorting */
        let theSort = {
            created_at: -1,
        }

        /** Customize sorting based on query parameters */
        if (queryParams?.sort_by && queryParams?.sort_order) {
            const sort = {}
            sort[queryParams.sort_by] = queryParams.sort_order
            theSort = sort
        }

        /** Apply search filter if present in query parameters */
        if (queryParams?.search) {
            queryParams.search = queryParams.search.replace(/[.*+?^${}&$#'=(\-)|[\]\\]/g, '\\$&')
            mongoose_query.$and.push({
                $or: [
                    { name: { $regex: queryParams.search, $options: 'i' } },
                ],
            })
        }

        /** Configure pagination and sorting options */
        const options = {
            page: parseInt(queryParams?.page, 10) || 1,
            limit: queryParams?.limit ? parseInt(queryParams.limit, 10) : 10,
            sort: theSort,
        }

        /** Apply additional conditions */
        mongoose_query.$and.push({ seller_email: emailAddress, auction_id: auctionId })
        // mongoose_query.$and.push({ deleted: false })

        /** Define projection to exclude unnecessary fields */
        options.projection = {
            _id: 1,
            auction_id: 1,
            name: 1,
            first_name: 1,
            last_name: 1,
            created_at: 1,
            paddle: 1,
            marketing: 1,
            status: 1,
            email_address: 1,
        }

        /** Fetch enterprises using the provided criteria */
        const bidsList = await mongodbHelper.list(RegisteredUser, mongoose_query, options)
        if (bidsList.docs.length <= 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Buyers not found',
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
        console.error(error)
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
