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
const helpers = require('../lib/helper')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const Buyer = require('../entities/Buyers')
const liveBid = require('../entities/LiveBid')


let connection = null


module.exports.place_bid = async (event) => {
    console.log('event', event)
    // --- Authorization Check ---
    try {
        const { claims } = event.requestContext.authorizer
        if (!claims || !claims['cognito:username']) {
            throw new Error('Unauthorized')
        }
        // You can add group checks here if needed
    } catch (error) {
        return {
            statusCode: 403,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
        }
    }
    // --- End Authorization Check ---

    try {
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        const request_body = JSON.parse(event.body)
        console.log(request_body)
        if (!request_body) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Invalid request body' }),
            }
        }

        const lotId = request_body.lot_id
        const buyerId = request_body.buyer_id
        const bidAmount = request_body.bid_amount
        const paddleNumber = request_body.paddle_number
        const auctionId = request_body.auction_id
        const bidType = request_body.bid_type
        const sellerEmail = request_body.seller_email

        const lot = await mongoConnection.view(Lot, { lot_id: lotId })
        if (!lot) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Lot not found' }),
            }
        }
        const auction = await mongoConnection.view(Auction, { auction_id: auctionId, seller_email: sellerEmail })
        if (!auction) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }
        // console.log('auction', auction)
        if (auction[0].status !== 'Published') {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Cannot place bid on an auction that is not published' }),
            }
        }
        const buyer = await mongoConnection.view(Buyer, { buyer_id: buyerId })
        if (!buyer) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Buyer not found' }),
            }
        }
        const registered = await mongoConnection.view(Buyer, { buyer_id: buyerId, auction_id: auctionId, seller_email: sellerEmail })
        if (!registered) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Buyer is not registered for this auction' }),
            }
        }

        const newBid = {
            lot_id: lotId,
            buyer_id: buyerId,
            bid_amount: bidAmount,
            paddle_number: paddleNumber,
            auction_id: auctionId,
            bid_type: bidType,
            name: buyer.name,
            email_address: buyer.email_address,
            seller_email: sellerEmail,
            // mobile_number: buyer.mobile_number,
            created_at: new Date(),
            updated_at: new Date(),
            timestamp: Math.floor(Date.now() / 1000),
        }
        try {
            await mongoConnection.save(newBid, liveBid)
            return {
                statusCode: 200,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Bid placed successfully' }),
            }
        } catch (error) {
            console.error(error)
            return {
                statusCode: 500,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Server error' }),
            }
        }
    } catch (error) {
        console.error(error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'Server error' }),
        }
    }
}
