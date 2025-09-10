/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const mongoConnection = require('../lib/mongodb_helper')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const helpers = require('../lib/helper')
const LiveBid = require('../entities/LiveBid')
const RegisteredBidder = require('../entities/RegisteredUser')

let connection = null

module.exports.delete_auction = async (event) => {
    console.log('event', event)
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
        console.log('email', email)

        // --- Validate request parameter ---
        if (!auction_id) {
            return {
                statusCode: 400,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction ID is required' }),
            }
        }

        // --- Check if auction exists and belongs to the seller ---
        const existingAuction = await Auction.findOne({ auction_id, seller_email: email })
        console.log('existingAuction', existingAuction)
        if (!existingAuction) {
            return {
                statusCode: 404,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found or you do not have permission to delete it' }),
            }
        }

        // --- Delete related data in parallel ---
        await Promise.all([
            Lot.deleteMany({ auction_id, seller_email: email }),
            LiveBid.deleteMany({ auction_id, seller_email: email }),
            // eslint-disable-next-line no-underscore-dangle
            RegisteredBidder.deleteMany({ auction_id: existingAuction._id, seller_email: email }),
        ])

        // --- Delete the auction ---
        const auctionDelete = await Auction.findOneAndDelete({ auction_id, seller_email: email })

        if (!auctionDelete) {
            return {
                statusCode: 404,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found or already deleted' }),
            }
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
