/* eslint-disable no-unused-vars */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */
const { createRedisClient } = require('../lib/redis_helper')
const mongodbHelper = require('../lib/mongodb_helper')

// Import Mongoose models from entities folder
const BidInformation = require('../entities/BidInformation')
const Bid = require('../entities/Bid') // For unique bids
const Lot = require('../entities/Lot')

// CORS headers
const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
}

/**
 * Deletes a bid from the system and updates related records
 */
async function deleteBid(event, context) {
    try {
        // Connect to MongoDB using the helper
        await mongodbHelper.connect()

        // Initialize Redis connection using the helper
        const redisClient = await createRedisClient()

        // Extract the bid ID from the event
        const bidId = event.pathParameters.bid_id

        // Look up the bid information using Mongoose models
        const bidInfo = await BidInformation.findById(bidId)

        if (!bidInfo) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: 'Bid not found' }),
            }
        }

        // Get the lot information
        const lotId = bidInfo.lot_id
        const bidAmount = bidInfo.bid_amount
        const buyerId = bidInfo.buyer_id

        // Get the lot information
        const lot = await mongodbHelper.getBuyer(lotId, Lot)

        if (!lot) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: 'Lot not found' }),
            }
        }

        // Check if auction is closed or locked
        if (lot.status === 'Closed' || lot.status === 'Locked') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Cannot delete bid on a closed or locked auction' }),
            }
        }

        // Get all bids for this lot sorted by bid amount in descending order
        const bidsQuery = { lot_id: lotId }

        const allBids = await BidInformation.find(bidsQuery).sort({ bid_amount: -1 })
        const allUniqueBids = await Bid.find(bidsQuery).sort({ bid_amount: -1 })

        // Only proceed if we found the bid
        if (!allBids || allBids.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: 'No bids found for this lot' }),
            }
        }

        // Delete the bid from both collections
        await BidInformation.findByIdAndDelete(bidId)

        // Delete from unique_bids collection
        await Bid.findOneAndDelete({
            lot_id: lotId,
            buyer_id: buyerId,
            bid_amount: bidAmount,
        })

        // Recalculate top bidder after deletion
        const remainingBids = await BidInformation.find(bidsQuery).sort({ bid_amount: -1 })

        // Update lot with new top bidder info
        let updateData = {}

        if (!remainingBids || remainingBids.length === 0) {
            // No bids left, clear bid information
            updateData = {
                current_bid: 0,
                top_bidder: '',
                paddle_number: null,
                winning_user: '',
                max_bid: 0,
            }
        } else {
            // Set the highest remaining bidder as the top bidder
            const newTopBid = remainingBids[0]
            updateData = {
                current_bid: newTopBid.bid_amount,
                top_bidder: newTopBid.name,
                paddle_number: newTopBid.paddle_number,
                winning_user: newTopBid.buyer_id,
                max_bid: newTopBid.max_bid || newTopBid.bid_amount,
            }

            // Update the status of the new top bidder to "Winning"
            await BidInformation.findByIdAndUpdate(
                newTopBid._id,
                { bid_status: 'Winning' },
            )
        }

        // Update the lot with the new top bidder information
        await Lot.findByIdAndUpdate(lotId, updateData)

        // Update Redis cache for this lot
        const redisKey = `lot:${lotId}`
        try {
            const existingRecord = await redisClient.hget('lot', redisKey)

            if (existingRecord) {
                const lotData = JSON.parse(existingRecord)
                // Update the lot data with new top bidder info
                Object.assign(lotData, updateData)
                // Save back to Redis using multi command for atomic operation
                await redisClient.multi()
                    .hset('lot', redisKey, JSON.stringify(lotData))
                    .exec()
            }
        } catch (e) {
            console.log(`Error updating Redis: ${e}`)
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Bid successfully deleted',
                deleted_bid_id: bidId,
                new_top_bidder: updateData.top_bidder || '',
            }),
        }
    } catch (e) {
        console.log(`Error deleting bid: ${e}`)
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: `There was an error while deleting the bid: ${e.toString()}` }),
        }
    }
}

/**
 * Lambda handler function for the delete_bid API endpoint
 */
// exports.handler = async (event, context) => await deleteBid(event, context)
