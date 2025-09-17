/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const { ObjectId } = require('mongodb')
const helpers = require('../lib/helper')
const mongoConnection = require('../lib/mongodb_helper')
const Lot = require('../entities/Lot')
const Counter = require('../entities/Counter')
const Auction = require('../entities/Auction')

let connection = null

async function updateLotNumbers(auctionId, sellerEmail, deletedLotNumber) {
    /**
   * Updates lot numbers after a lot is deleted to maintain sequential ordering
   */
    try {
        // Find all lots with lot_number greater than deleted lot
        const lotsToUpdate = await Lot.find({
            auction_id: auctionId,
            seller_email: sellerEmail,
            lot_number: { $gt: deletedLotNumber },
        }).sort({ lot_number: 1 })

        // Prepare bulk operations
        if (!lotsToUpdate || lotsToUpdate.length === 0) {
            return true
        }

        const bulkOps = lotsToUpdate.map((lot) => ({
            updateOne: {
                filter: { _id: new ObjectId(lot._id) },
                update: { $set: { lot_number: lot.lot_number - 1 } },
            },
        }))

        // Execute bulk write if there are updates
        if (bulkOps.length > 0) {
            await Lot.bulkWrite(bulkOps)
            return true
        }

        return false
    } catch (err) {
        console.error(`Error updating lot numbers: ${err.message}`)
        return false
    }
}

module.exports.delete_lot = async (event) => {
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

        const { lot_id, auction_id } = JSON.parse(event.body) || {}

        // --- Validate request body ---
        if (!lot_id || !auction_id) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Lot ID and auction ID is required' }),
            }
        }

        // Get seller email from Cognito claims
        const email = event.requestContext.authorizer.claims['cognito:username']
        const auctionDetails = await Auction.findOne({ auction_id, seller_email: email })

        // --- Validate auction and state ---
        if (!auctionDetails) {
            return {
                statusCode: 404,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }
        if (auctionDetails.status !== 'Draft') {
            return {
                statusCode: 400,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not in draft state' }),
            }
        }

        // --- Delete the lot based on lot id ---
        const lot = await Lot.findOneAndDelete({ _id: new ObjectId(lot_id) })

        if (!lot) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Lot not found' }),
            }
        }

        // --- Update lot counter (decrement sequence) ---
        await Counter.findOneAndUpdate({
            seller_email: email, auction_id, record_type: 'Lots',
        }, { $inc: { starting_sequence: -1 } })

        // --- Reorder remaining lots sequentially ---
        if (!(await updateLotNumbers(auction_id, email, lot.lot_number))) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Error updating lot numbers' }),
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
