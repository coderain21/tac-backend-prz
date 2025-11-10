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
const Lot = require('../entities/Lot')
const Auction = require('../entities/Auction')
const Buyers = require('../entities/Buyers')
const Cart = require('../entities/Cart')

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
 * Retrieves lot details from Redis and triggers SQS when conditions are met.
 * For Individual/Cascade lots: adds winning items to cart immediately when lot ends.
 * For All Lots: cart addition is handled in the SQS trigger function.
 *
 * @param {string} lot_id - The ID of the lot to retrieve.
 * @param {object} client - The Redis client for database interaction.
 * @returns {object} The lot details retrieved from Redis or MongoDB.
 */
module.exports.handler = async (event) => {
    try {
        console.log('event', event)
        if (connection === null || !connection.readyState) {
            connection = await mongodbHelper.connect()
        }

        // Check auction data first for All Lots handling
        const auctionData = await mongodbHelper.getAuction(event, Auction)

        if (auctionData.extension_type === 'All Lots') {
            // Check if auction already processed
            if (auctionData.status === 'Completed') {
                console.log('Auction already processed, skipping')
                return true
            }

            // Only lot #1 should process
            if (event.lot_number !== 1) {
                console.log('Not lot #1, skipping processing for All Lots auction')
                return true
            }
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
        const getLots = await mongodbHelper.getAuctionsLots(event, currentTimestamp, Lot)

        // Check if auction should be completed
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

        // Flag to track if we should trigger SQS
        let shouldTriggerSQS = false

        if (auctionData.status !== 'Cancelled') {
            // Only process lots that have ended
            if (lotInformation.end_date < currentTimestamp && get_lot.length > 0) {
                // Update latest bid record regardless of winner
                await mongodbHelper.getLatestRecord(lotInformation, BidInformation)

                // Add to cart immediately for Individual/Cascade lots
                if ((auctionData.extension_type === 'Cascade' || auctionData.extension_type === 'Individual Lots') && lotInformation.winning_user) {
                    try {
                        const getBuyerData = await mongodbHelper.getBuyer(lotInformation.winning_user, Buyers)
                        if (getBuyerData && Object.keys(getBuyerData).length > 0) {
                            lotInformation.email_address = getBuyerData.email_address || null
                            lotInformation.name = getBuyerData.first_name || null
                            await mongodbHelper.lotToCart(lotInformation, auctionData, Cart)
                            console.log(`Added lot ${event.lot_number} to cart immediately for winner ${lotInformation.winning_user}`)
                        }
                    } catch (cartError) {
                        console.error('Error adding lot to cart immediately:', cartError)
                    }
                }

                // Check conditions for triggering SQS (with or without winner)
                if (auctionData.extension_type === 'All Lots' && event.lot_number === 1) {
                    shouldTriggerSQS = true
                } else if (getLots.length <= 0 && (auctionData.extension_type === 'Cascade' || auctionData.extension_type === 'Individual Lots')) {
                    shouldTriggerSQS = true
                }
            }
        }

        // Trigger SQS only once if conditions are met
        if (shouldTriggerSQS) {
            console.log('Triggering SQS function for auction completion')
            await sqsTriggerFunction(event)
        }

        return true
    } catch (err) {
        console.log('Internal Server Error', err)
        return err
    }
}
