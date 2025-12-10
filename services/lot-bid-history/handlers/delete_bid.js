/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-unused-vars */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */
const axios = require('axios')
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
 * Send socket notification to all connected clients
 */
async function sendSocketNotification(payload) {
    try {
        const headersList = {
            Accept: '*/*',
            'User-Agent': 'API',
            'Content-Type': 'application/json',
        }
        const reqUrl = `${process.env.SOCKET_URL}/notification`
        await axios.post(reqUrl, payload, { headers: headersList })
        console.log('Socket notification sent successfully')
    } catch (err) {
        console.error('Error sending socket notification:', err.message)
    }
}

/**
 * Deletes a bid from the system and updates related records
 */
module.exports.handler = async (event, context) => {
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

        // Check if this is the top bid - only top bid can be deleted
        const topBid = await BidInformation.findOne({ lot_id: lotId }).sort({ bid_amount: -1 })

        if (!topBid || topBid._id.toString() !== bidId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Only the top bid can be deleted' }),
            }
        }

        // Get all bids for this lot sorted by created_at in descending order
        const bidsQuery = { lot_id: lotId }

        const allBids = await BidInformation.find(bidsQuery).sort({ created_at: -1 })
        const allUniqueBids = await Bid.find(bidsQuery).sort({ created_at: -1 })

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
            // No bids left, clear bid information and ensure status is "Accepting Bids"
            updateData = {
                current_bid: 0,
                top_bidder: '',
                paddle_number: null,
                winning_user: '',
                max_bid: 0,
                status: 'Accepting Bids',
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
        let updatedLotData = null
        try {
            const existingRecord = await redisClient.hget('lot', redisKey)

            if (existingRecord) {
                const lotData = JSON.parse(existingRecord)
                // Update the lot data with new top bidder info
                Object.assign(lotData, updateData)
                updatedLotData = lotData
                // Save back to Redis using multi command for atomic operation
                await redisClient.multi()
                    .hset('lot', redisKey, JSON.stringify(lotData))
                    .exec()
            }
        } catch (e) {
            console.log(`Error updating Redis: ${e}`)
        }

        // Get updated lot information for socket notification
        const updatedLot = await Lot.findById(lotId)

        // Get all remaining bids for this lot to send in notification
        const allRemainingBids = await BidInformation.find({ lot_id: lotId })
            .sort({ bid_amount: -1 })
            .lean()

        // Prepare bid history data for socket notification
        const bidHistoryData = {
            success: true,
            newResponse: {
                top_bid: updateData.current_bid || 0,
                bidders: await Bid.countDocuments({ lot_id: lotId }),
                top_bidder: updateData.top_bidder || '',
                under_bidder: allRemainingBids.length > 1 ? {
                    name: allRemainingBids[1].name,
                    id: allRemainingBids[1]._id,
                    bid_amount: allRemainingBids[1].bid_amount,
                } : {},
                all_bidders: allRemainingBids,
            },
        }

        // Send socket notifications to all connected clients
        try {
            // Notify about bid deletion
            await sendSocketNotification({
                event: 'deleteBid',
                lot_id: lotId,
                bid_id: bidId,
                auction_id: updatedLot?.auction_id,
                buyer_id: buyerId,
                new_top_bidder: updateData.top_bidder || '',
            })

            // Send updated bid history to seller clients
            await sendSocketNotification({
                event: 'sellerListBidHistory',
                ...bidHistoryData,
            })

            // Update lot information for all clients
            if (updatedLotData) {
                await sendSocketNotification({
                    event: 'lotUpdate',
                    lots: updatedLotData,
                })
            }
        } catch (socketError) {
            console.error('Error sending socket notifications:', socketError.message)
            // Don't fail the request if socket notification fails
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Bid successfully deleted',
                deleted_bid_id: bidId,
                new_top_bidder: updateData.top_bidder || '',
                lot_id: lotId,
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
// exports.handler = async (event, context) => deleteBid(event, context)
