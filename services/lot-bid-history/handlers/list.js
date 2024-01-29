/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */

const { ObjectId } = require('mongodb')
const helpers = require('../lib/helper')
const BidInformation = require('../entities/BidInformation')
const Lot = require('../entities/Lot')
const Bid = require('../entities/Bid')
const helper = require('../utilities/helper')
const mongodbHelper = require('../lib/mongodb_helper')

let connection
/**
 * List Bidders | Seller Lot List
 * @description - API to list all bidders
 * @route - GET /{lot_id}
 * @access - (Private)
 * @user - IndyAuction Seller
 * @returns {Object} (200) - List of bidders
 * @returns {Error} (500) - There was an error while listing bidders
 */
module.exports.handler = async (event) => {
    try {
        /** Establish database connection */
        connection = await mongodbHelper.connect()

        const lotId = decodeURIComponent(event.pathParameters.lot_id)
        const query = {
            _id: new ObjectId(lotId),
        }
        const getLot = await mongodbHelper.view(Lot, query)
        const queryCount = {
            lot_id: lotId,
        }
        const getBiddderCount = await mongodbHelper.view(Bid, queryCount)

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
        /** Configure pagination and sorting options */
        const options = {
            page: parseInt(queryParams?.page, 10) || 1,
            limit: queryParams?.limit ? parseInt(queryParams.limit, 10) : 10,
            sort: theSort,
        }

        /** Apply additional conditions */
        mongoose_query.$and.push({ lot_id: lotId })
        // mongoose_query.$and.push({ deleted: false })

        /** Define projection to exclude unnecessary fields */
        options.projection = {
            paddle_number: 1,
            name: 1,
            bid_amount: 1,
            time_stamp: 1,
            created_at: 1,
            updated_at: 1,

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

        const getLowestBidder = await helper.getLowestBidder(lotId, Bid)

        /** Handle error when enterprises cannot be fetched */
        let underBidder = {}
        console.log('getLowestBidder', getLowestBidder.length)
        if (getLowestBidder.length === 1 || getLowestBidder.length === 0) {
            underBidder = {

            }
        } else {
            underBidder = {
                name: getLowestBidder[1].name,
                id: new ObjectId(getLowestBidder[1]._id),

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
                    top_bid: getLot.length > 0 ? getLot[0].current_bid : 0,
                    bidders: getBiddderCount.length > 0 ? getBiddderCount.length : 0,
                    top_bidder: getLot.length > 0 ? getLot[0].top_bidder : '',
                    under_bidder: underBidder,
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
                message: 'There was an error while listing bids',
            }),
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
