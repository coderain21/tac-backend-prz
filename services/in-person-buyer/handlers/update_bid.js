/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const { ObjectId } = require('mongodb')
const helpers = require('../lib/helper')
const mongoConnection = require('../lib/mongodb_helper')
const LiveBid = require('../entities/LiveBid')
const Auction = require('../entities/Auction')

let connection = null

module.exports.update_bid = async (event) => {
    try {
        // --- Authorization Check ---
        const { claims } = event.requestContext?.authorizer || {}
        if (!claims || !claims['cognito:username']) {
            return {
                statusCode: 403,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }

        // --- Ensure MongoDB connection ---
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        const { bid_id } = event.pathParameters || {}
        const buyerEmail = claims['cognito:username']

        // --- Validate request parameter ---
        if (!bid_id) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Bid ID is required' }),
            }
        }

        // --- Validate ObjectId format ---
        if (!ObjectId.isValid(bid_id)) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Invalid bid ID format' }),
            }
        }

        // --- Parse and validate request body ---
        const requestBody = JSON.parse(event.body) || {}
        const {
            bid_amount,
            phone_number,
            country_code,
        } = requestBody

        // --- Find the existing bid ---
        const existingBid = await mongoConnection.view(LiveBid, { _id: new ObjectId(bid_id) })
        if (existingBid.length <= 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Bid not found' }),
            }
        }

        const bidData = existingBid[0]

        if (buyerEmail !== bidData.buyer_email) {
            return {
                statusCode: 403,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to modify this bid' }),
            }
        }

        // --- Verify auction ownership and get auction details ---
        const auctionDetails = await mongoConnection.view(Auction, {
            auction_id: bidData.auction_id,
            seller_email: bidData.seller_email,
        })
        if (auctionDetails.length <= 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }

        const auction = auctionDetails[0]

        // --- Check if auction has started (prevent editing during active auction) ---
        const currentTime = Math.floor(Date.now() / 1000) // Convert to seconds
        if ((auction.start_date < currentTime && auction.status === 'Published') || auction.status === 'In Progress' || auction.status === 'Draft') {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Cannot edit bid after auction has started',
                }),
            }
        }

        // --- Validate fields based on bid type ---
        if (bidData.bid_type === 'telephone') {
            // For telephone bids, phone_number and country_code are required
            if (!phone_number || !country_code || !bid_amount) {
                return {
                    statusCode: 400,
                    headers: await helpers.getHeaders(),
                    body: JSON.stringify({
                        message: 'Phone number, country code and bid amount are required for telephone bids',
                    }),
                }
            }
        } else if (bidData.bid_type === 'absentee') {
            // For absentee bids, only bid_amount can be edited
            if (!bid_amount) {
                return {
                    statusCode: 400,
                    headers: await helpers.getHeaders(),
                    body: JSON.stringify({
                        message: 'Bid amount is required for absentee bids',
                    }),
                }
            }
        } else {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Invalid bid type',
                }),
            }
        }

        // --- Prepare update data based on bid type ---
        const updateData = {
            bid_amount: parseFloat(bid_amount),
            updated_at: Math.floor(Date.now() / 1000),
        }

        // --- Add telephone-specific fields only for telephone bids ---
        if (bidData.bid_type === 'telephone') {
            updateData.phone_number = phone_number.trim()
            updateData.country_code = country_code.trim()
        }

        // --- Update the bid ---
        const updatedBid = await mongoConnection.update(
            LiveBid,
            new ObjectId(bid_id),
            updateData,
        )

        if (!updatedBid) {
            return {
                statusCode: 500,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Failed to update bid',
                }),
            }
        }

        // --- Return successful response ---
        return {
            statusCode: 204,
            headers: await helpers.getHeaders(),
        }
    } catch (error) {
        console.log('Internal Server Error', error)
        return {
            headers: await helpers.getHeaders(),
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
