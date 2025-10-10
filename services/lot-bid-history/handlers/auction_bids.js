/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */

const { ObjectId } = require('mongodb')
const helpers = require('../lib/helper')
const BidInformation = require('../entities/BidInformation')
const Lot = require('../entities/Lot')
const Auction = require('../entities/Auction')
const mongodbHelper = require('../lib/mongodb_helper')

let connection

/**
 * List Auction Bids
 * @description - API to list all bids for an auction
 * @route - GET /buyer/{auction_id}?buyer_id=xxx
 * @access - (Private)
 * @user - IndyAuction Buyer
 * @returns {Object} (200) - List of auction bids grouped by lot_id
 * @returns {Error} (500) - There was an error while listing auction bids
 */
module.exports.handler = async (event) => {
    try {
        connection = await mongodbHelper.connect()
        const auctionObjectId = decodeURIComponent(event.pathParameters.auction_id)
        const { queryStringParameters: queryParams } = event

        // buyer_id is mandatory
        if (!queryParams?.buyer_id) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'buyer_id is required' }),
            }
        }

        // Get auction details first
        const auctionQuery = { _id: new ObjectId(auctionObjectId) }
        const auction = await mongodbHelper.view(Auction, auctionQuery)

        if (auction.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }

        const { auction_id, seller_email } = auction[0]

        // Get lots for this auction
        const lotsQuery = {
            auction_id,
            seller_email,
        }
        const lots = await mongodbHelper.view(Lot, lotsQuery)

        if (lots.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'No lots found' }),
            }
        }

        const lotIds = lots.map((lot) => lot._id.toString())
        const mongoose_query = {
            $and: [
                { lot_id: { $in: lotIds } },
                { buyer_id: queryParams.buyer_id },
            ],
        }

        const options = {
            page: parseInt(queryParams?.page, 10) || 1,
            limit: queryParams?.limit ? parseInt(queryParams.limit, 10) : 10,
            sort: { time_stamp: -1 },
            projection: {
                paddle_number: 1,
                name: 1,
                bid_amount: 1,
                time_stamp: 1,
                created_at: 1,
                updated_at: 1,
                is_greyed_out: 1,
                location: 1,
                buyer_id: 1,
                lot_id: 1,
            },
        }

        const bidsList = await mongodbHelper.list(BidInformation, mongoose_query, options)

        // Group bids by lot_id
        // Group bids by lot_id and limit to 1 bid per lot
        // Initialize all lots with empty arrays, then add bids (limit 1 per lot)
        const groupedData = {}
        lotIds.forEach((lotId) => {
            groupedData[lotId] = []
        })

        bidsList.docs.forEach((bid) => {
            if (!groupedData[bid.lot_id].length) {
                groupedData[bid.lot_id] = [bid]
            }
        })

        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                data: groupedData,
                pagination: {
                    total_pages: bidsList.totalPages,
                    limit: bidsList.limit,
                    total_records: bidsList.totalDocs,
                    next_page: bidsList.nextPage,
                    page: bidsList.page,
                    total_lots: lots.length,
                },
            }),
        }
    } catch (error) {
        console.error(error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'Error listing auction bids',
            }),
        }
    } finally {
        if (connection) {
            await connection.disconnect()
        }
    }
}
