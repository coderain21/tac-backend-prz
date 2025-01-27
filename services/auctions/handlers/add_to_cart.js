/* eslint-disable no-plusplus */
/* eslint-disable camelcase */
/* eslint-disable consistent-return */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */

const mongodbHelper = require('../lib/mongodb_helper')
const { sqsTriggerFunction } = require('./sqs_trigger_function')
const BidInformation = require('../entities/BidInformation')
const redisHelper = require('../lib/redis_helper')
const Buyers = require('../entities/Buyers')
const Cart = require('../entities/Cart')
const Lot = require('../entities/Lot')
const Auction = require('../entities/Auction')

let connection = null

async function getLot(rediskey, client) {
    try {
        const existingRecord = await client.hget('lot', rediskey)
        // If the lot was found in Redis, return it as a single-element array
        if (existingRecord) {
            return [existingRecord]
        }
        // If the lot was not found in Redis, return an empty array
        return []
    } catch (err) {
        // Log any errors which occur
        console.log(err)
        // Return an empty array
        return []
    }
}

/**
 * Retrieves lot details from Redis based on the provided lot ID.
 * Retrieves auction details from Redis based on the provided lot ID.
 * updates Redis, and returns the lot details.
 *
 * @param {string} lot_id - The ID of the lot to retrieve.
 * @param {object} client - The Redis client for database interaction.
 *  @param {object} buyer information - to save the lot to cart.
 * @returns {object} The lot details retrieved from Redis or MongoDB.
 */
module.exports.handler = async (event) => {
    try {
        console.log('even', event)
        if (connection === null || !connection.readyState) {
            connection = await mongodbHelper.connect()
        }
        const currentTimestamp = new Date(Date.now()).getTime()
        const rediskey = `lot:${event._id}`
        const client = await redisHelper.createRedisClient()
        const query = {
            auction_id: event.auction_id,
            seller_email: event.seller_email,
            winning_user: { $exists: true },
        }

        const getTotalActiveSales = await mongodbHelper.getTotalActiveSales(query, Lot)
        const auctionData = await mongodbHelper.getAuction(event, Auction)
        const getLots = await mongodbHelper.getAuctionsLots(event, currentTimestamp, Lot)
        if (getLots.length <= 0 && getTotalActiveSales === 0) {
            await mongodbHelper.update(Auction, auctionData._id, { status: 'Completed' })
            return true
        }
        const getLotInfo = await getLot(rediskey, client, event._id)
        const get_lot = []
        for (let i = 0; i < getLotInfo.length; i++) {
            get_lot.push(JSON.parse(getLotInfo[i]))
        }
        const lotInformation = get_lot[0]

        console.log('currentTimestamp', currentTimestamp)
        if (auctionData.status !== 'Cancelled') {
            if (lotInformation.end_date < currentTimestamp && get_lot.length > 0 && lotInformation.winning_user) {
                // Get the final winning bid amount
                const winningBid = await mongodbHelper.getLatestRecord(lotInformation, BidInformation)

                const getBuyerData = await mongodbHelper.getBuyer(lotInformation.winning_user, Buyers)
                console.log('getBuyerData', getBuyerData)

                if (getBuyerData && Object.keys(getBuyerData).length > 0) {
                    console.log('here inside the condition')
                    lotInformation.email_address = getBuyerData.email_address === undefined ? null : getBuyerData.email_address
                    lotInformation.name = getBuyerData.first_name === undefined ? null : getBuyerData.first_name

                    // Add winning bid amount to lot information
                    lotInformation.winning_bid_amount = winningBid ? winningBid.bid_amount : lotInformation.current_bid

                    // Check if email has already been sent
                    // const emailSent = await Cart.findOne({
                    //     lot_id: lotInformation._id,
                    //     buyer_id: lotInformation.winning_user,
                    // })

                    const session = await connection.startSession()
                    try {
                        await session.withTransaction(async () => {
                            const emailSent = await Cart.findOne({
                                lot_id: lotInformation._id,
                                buyer_id: lotInformation.winning_user,
                            }).session(session)

                            if (!emailSent) {
                                await mongodbHelper.lotToCart(lotInformation, auctionData, Cart)

                                // Add a flag in Redis to prevent duplicate processing
                                const processingKey = `processing:${auctionData.auction_id}`
                                const isProcessing = await client.get(processingKey)

                                if (!isProcessing) {
                                    // Set processing flag with 5-minute expiry
                                    await client.set(processingKey, '1', 'EX', 300)

                                    if (auctionData.extension_type === 'All Lots' && event.lot_number === 1) {
                                        await sqsTriggerFunction(event)
                                    } else if (getLots.length <= 0
                                        && (auctionData.extension_type === 'Cascade'
                                         || auctionData.extension_type === 'Individual Lots')) {
                                        await sqsTriggerFunction(event)
                                    }
                                }
                            }
                        })
                    } finally {
                        await session.endSession()
                    }
                }
            }
        }

        // Remove duplicate conditions and simplify the non-winning user case
        if (lotInformation.end_date < currentTimestamp && get_lot.length > 0 && !lotInformation.winning_user) {
            if (auctionData.extension_type === 'All Lots' && event.lot_number === 1) {
                await sqsTriggerFunction(event)
            } else if (getLots.length <= 0
                && (auctionData.extension_type === 'Cascade'
                 || auctionData.extension_type === 'Individual Lots')) {
                await sqsTriggerFunction(event)
            }
        }

        return true
    } catch (err) {
        console.log(err)
        return err
    }
}
