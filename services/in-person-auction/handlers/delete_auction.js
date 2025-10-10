/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const AWS = require('aws-sdk')
const mongoConnection = require('../lib/mongodb_helper')
const Auction = require('../entities/Auction')
// const Lot = require('../entities/Lot')
const helpers = require('../lib/helper')
const LiveBid = require('../entities/LiveBid')
const RegisteredBidder = require('../entities/RegisteredUser')
const BuyerWishlist = require('../entities/BuyerWishlist')

let connection = null

module.exports.delete_auction = async (event) => {
    try {
        // --- Authorization Check ---
        const { claims } = event.requestContext.authorizer
        if (!claims || !claims['cognito:username']) {
            return {
                statusCode: 403,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }

        // --- Ensure MongoDB connection ---
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        const { auction_id } = event.pathParameters || {}
        const email = claims['cognito:username']

        // --- Validate request parameter ---
        if (!auction_id) {
            return {
                statusCode: 400,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction ID is required' }),
            }
        }

        // --- Check if auction exists and belongs to the seller ---
        const existingAuction = await mongoConnection.view(Auction, { auction_id, seller_email: email })
        if (!existingAuction || existingAuction.length === 0) {
            return {
                statusCode: 404,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found or you do not have permission to delete it' }),
            }
        }

        if (existingAuction[0].status !== 'Draft') {
            return {
                statusCode: 400,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Cannot delete this Auction with the current status' }),
            }
        }

        // --- Delete related data in parallel ---
        await Promise.all([
            // mongoConnection.deleteBulk(Lot, { auction_id, seller_email: email }),
            mongoConnection.deleteBulk(LiveBid, { auction_id, seller_email: email }),
            mongoConnection.deleteBulk(BuyerWishlist, { auction_id, seller_email: email }),
            // eslint-disable-next-line no-underscore-dangle
            mongoConnection.deleteBulk(RegisteredBidder, { auction_id: (existingAuction[0]._id), seller_email: email }),
        ])

        // --- Delete the auction ---
        const auctionDelete = await mongoConnection.deleteData(Auction, { auction_id, seller_email: email })

        if (!auctionDelete) {
            return {
                statusCode: 404,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found or already deleted' }),
            }
        }

        // --- Trigger async cleanup Lambda ---
        try {
            const lambda = new AWS.Lambda()
            const cleanupPayload = {
                auction_id,
                seller_email: email,
                auction_image: existingAuction[0].auction_image,
                auction_logo_image: existingAuction[0].logo_image,
                event_background_image: existingAuction[0].event_display.background_image,
                event_left_image: existingAuction[0].event_display.left_logo_image,
                event_right_image: existingAuction[0].event_display.right_logo_image,
            }

            await lambda.invoke({
                FunctionName: `auctions-${process.env.STAGE}-auction-cleanup`,
                InvocationType: 'Event', // Async invocation
                Payload: JSON.stringify(cleanupPayload),
            }).promise()

            console.log(`Triggered async cleanup for auction ${auction_id}`)
        } catch (error) {
            console.error(`Failed to trigger cleanup Lambda: ${error.message}`)
        }

        // --- Return success with deleted auction id ---
        return {
            statusCode: 204,
            headers: helpers.getHeaders(),
            body: JSON.stringify({
                message: 'Auction deleted successfully',
                // eslint-disable-next-line no-underscore-dangle
                deleted_auction_id: auctionDelete._id,
            }),
        }
    } catch (error) {
        console.error('Internal Server Error:', error)
        return {
            statusCode: 500,
            headers: helpers.getHeaders(),
            body: JSON.stringify({ message: 'Internal Server Error' }),
        }
    }
}
