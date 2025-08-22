/* eslint-disable no-multiple-empty-lines */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const { ObjectId } = require('mongodb')
const mongoConnection = require('../lib/mongodb_helper')
const Auction = require('../entities/Auction')
const LiveBid = require('../entities/LiveBid') // <-- assuming you have a Bid model
const helpers = require('../lib/helper')

let connection = null

module.exports.get_bids = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        const auctionId = event.pathParameters.auction_id
        const data = event.queryStringParameters || {}
        const buyerId = data.buyer_id
        const lotId = data.lot_id // optional

        console.log('auctionId', auctionId)
        console.log('buyerId', buyerId)
        console.log('lotId', lotId)

        if (!auctionId) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Please provide auction_id' }),
            }
        }

        if (!buyerId) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Please provide buyer_id' }),
            }
        }

        // verify auction exists
        const auctionExists = await Auction.findOne({ _id: new ObjectId(auctionId) }).lean()
        console.log('auctionExists', auctionExists)
        if (!auctionExists) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }

        // build query
        const query = {
            auction_id: auctionExists.auction_id,
            seller_email: auctionExists.seller_email,
            buyer_id: buyerId,
        }
        if (lotId) {
            query.lot_id = lotId
        }

        // fetch bids
        const bids = await LiveBid.find(query, {
            _id: 0,
            lot_id: 1,
            bid_amount: 1,
            buyer_id: 1,
            bid_type: 1,
        }).lean()

        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ bids }),
        }
    } catch (error) {
        console.log('Error:', error.message)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: error.message }),
        }
    }
}
