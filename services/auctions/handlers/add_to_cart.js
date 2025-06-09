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
        console.log('event', event)
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

        // Early return if no lots and no sales
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
                const getBuyerData = await mongodbHelper.getBuyer(lotInformation.winning_user, Buyers)
                console.log('getBuyerData', getBuyerData)
                if (getBuyerData && Object.keys(getBuyerData).length > 0) {
                    console.log('here inside the condition')
                    lotInformation.email_address = getBuyerData.email_address === undefined ? null : getBuyerData.email_address
                    lotInformation.name = getBuyerData.first_name === undefined ? null : getBuyerData.first_name
                    await mongodbHelper.lotToCart(lotInformation, auctionData, Cart)
                }
                await mongodbHelper.getLatestRecord(lotInformation, BidInformation)
            }
        }

        // NEW LOGIC: Unified SQS trigger control
        let shouldTriggerSQS = false

        // For "All Lots" - trigger only once when the first lot ends
        if (auctionData.extension_type === 'All Lots' && event.lot_number === 1) {
            shouldTriggerSQS = true
        }
        // For "Cascade" and "Individual Lots" - trigger only when all lots are completed
        else if ((auctionData.extension_type === 'Cascade' || auctionData.extension_type === 'Individual Lots')
                && getLots.length <= 0) {
            shouldTriggerSQS = true
        }

        // Execute SQS trigger only once per auction
        if (shouldTriggerSQS) {
            console.log('Triggering SQS for auction:', event.auction_id, 'Extension type:', auctionData.extension_type)
            await sqsTriggerFunction(event)

            // Mark the auction as processed to prevent duplicate triggers
            await mongodbHelper.update(Auction, auctionData._id, {
                status: 'Completed',
                payment_emails_sent: true,
            })
        }

        return true
    } catch (err) {
        console.log('Internal Server Error', err)
        return err
    }
}
