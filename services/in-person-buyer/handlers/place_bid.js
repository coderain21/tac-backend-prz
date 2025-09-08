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
const { mongo } = require('mongoose')
const mongoConnection = require('../lib/mongodb_helper')
const helpers = require('../lib/helper')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const Buyer = require('../entities/Buyers')
const RegisteredUser = require('../entities/RegisteredUser')
const liveBid = require('../entities/LiveBid')


let connection = null


module.exports.place_bid = async (event) => {
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

        const lot = await mongoConnection.view(Lot, { _id: new ObjectId(lotId) })
        if (lot.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Lot not found' }),
            }
        }
        const auction = await mongoConnection.view(Auction, { auction_id: auctionId, seller_email: sellerEmail })
        if (auction.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }
        if (auction[0].start_date < Math.floor(Date.now()) && auction[0].status !== 'In Progress') {
            await mongoConnection.update(Auction, { _id: auction[0]._id }, { status: 'In Progress' })
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Cannot place bid on an auction that has already started' }),
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
        const buyer = await mongoConnection.view(Buyer, { _id: new ObjectId(buyerId) })
        if (buyer.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Buyer not found' }),
            }
        }
        const registered = await mongoConnection.view(RegisteredUser, { email_address: buyer[0].email_address, auction_id: new ObjectId(auction[0]._id), seller_email: sellerEmail })
        if (registered.length === 0) {
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
            timestamp: Math.floor(Date.now()),
        }
        const placedBid = await mongoConnection.view(liveBid, { lot_id: lotId, buyer_id: buyerId })
        if (placedBid && placedBid.length > 0) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Bid already placed' }),
            }
        }
        try {
            const bidPlaces = await mongoConnection.save(newBid, liveBid)
            if (!bidPlaces) {
                return {
                    statusCode: 400,
                    headers: await helpers.getHeaders(),
                    body: JSON.stringify({ message: 'Bid not placed' }),
                }
            }
            return {
                statusCode: 201,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Bid placed successfully' }),
            }
        } catch (error) {
            console.log('Error', error)
            return {
                statusCode: 500,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Internal Server error' }),
            }
        }
    } catch (error) {
        console.log('Error', error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'Internal Server error' }),
        }
    }
}
