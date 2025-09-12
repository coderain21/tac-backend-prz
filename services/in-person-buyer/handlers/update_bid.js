/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const { ObjectId } = require('mongodb')
const helpers = require('../lib/helper')
const mongoConnection = require('../lib/mongodb_helper')
const { sendTransactionalEmail, getBidConfirmationTemplate } = require('../lib/mailchimp_helper')
const LiveBid = require('../entities/LiveBid')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const Buyer = require('../entities/Buyers')
const Users = require('../entities/Users')

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

        if (buyerEmail !== bidData.email_address) {
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
        const currentTime = Math.floor(Date.now())
        if ((auction.start_date < currentTime && auction.status === 'Published') || auction.status === 'In Progress' || auction.status === 'Draft') {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Cannot edit bid after auction has started',
                }),
            }
        }

        // --- Check if the auction accepts the bid type ---
        if (auction[`accept_${bidData.bid_type}_bid`] !== true) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: `This auction is not accepting ${bidData.bid_type} bids`,
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

        // --- Fetch lot and buyer details ---
        const lot = await mongoConnection.view(Lot, { _id: new ObjectId(bidData.lot_id) })
        if (lot.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Lot not found' }),
            }
        }

        const buyer = await mongoConnection.view(Buyer, { _id: new ObjectId(bidData.buyer_id) })
        if (buyer.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Buyer not found' }),
            }
        }

        // --- Fetch seller details to get seller ID ---
        const sellerDetails = await mongoConnection.view(Users, { email_address: bidData.seller_email })
        const sellerId = sellerDetails[0]._id

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

        // Prepare data for email
        const currentBidDetails = {
            buyer_id: updateData.buyer_id,
            lot_id: updateData.lot_id,
            bid_amount: updateData.bid_amount,
            bid_type: bidData.bid_type,
            country_code: updateData.country_code,
            phone_number: updateData.phone_number,
        }

        // Single call approach
        const templateName = await getBidConfirmationTemplate(sellerId, currentBidDetails.bid_type)

        // Send transactional email
        await sendTransactionalEmail([], lot[0], auction, currentBidDetails, buyer[0], templateName)

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
