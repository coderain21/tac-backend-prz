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

module.exports.delete_bid = async (event) => {
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
        const sellerEmail = claims['cognito:username']

        // --- Validate request parameter ---
        if (!bid_id) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Bid ID is required' }),
            }
        }

        const bidData = await mongoConnection.view(LiveBid, { _id: new ObjectId(bid_id) })
        if (bidData.length <= 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Bid not found' }),
            }
        }

        const auctionDetails = await mongoConnection.view(Auction, { auction_id: bidData[0].auction_id, seller_email: sellerEmail })
        if (auctionDetails.length <= 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }

        if (auctionDetails[0].start_date < Math.floor(Date.now()) && auctionDetails[0].status !== 'Draft') {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction has already started' }),
            }
        }

        // --- Delete the bid based on bid id ---
        const bid = await mongoConnection.deleteData(LiveBid, { _id: new ObjectId(bid_id) })

        if (!bid) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Bid not found' }),
            }
        }

        // Return 204 No Content on successful deletion
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
