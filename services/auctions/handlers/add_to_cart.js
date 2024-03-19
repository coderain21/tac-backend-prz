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

async function getLot(rediskey, client, id) {
    const allBidders = await client.hGetAll('lot', rediskey)
    return Object.values(allBidders || {}).filter((bidder) => {
        const parsedBidder = JSON.parse(bidder)
        return parsedBidder._id === id
    })
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
        const currentTimestamp = new Date(Date.now()).getTime()
        console.log(currentTimestamp)
        const rediskey = `lot:${event._id}`
        // const client = await redis.createClient({
        //     url: process.env.REDIS_URL,
        // }).on('error', (err) => console.log('Redis Client Error', err)).connect()
        // // Check if the Redis client is not open, then connect
        // if (!client.isOpen) {
        //     await client.connect()
        // }
        const client = await redisHelper.createRedisClient()
        console.log('client', client)
        const getLotInfo = await getLot(rediskey, client, event._id)
        const lotInformation = JSON.parse(getLotInfo)
        if (lotInformation.end_date < currentTimestamp) {
            const auctionData = await mongodbHelper.getAuction(event, process.env.TABLE_NAME)
            await mongodbHelper.lotToCart(lotInformation, auctionData)
            await mongodbHelper.getLatestRecord(lotInformation, BidInformation)
            const getLots = await mongodbHelper.getAuctionsLots(event, currentTimestamp)

            // const callSQS = await sqsTriggerFunction(event)
            if (auctionData[0].extension_type === 'All Lots' && event.lot_number === 1) {
                await sqsTriggerFunction(event)
            }
            if (getLots.length <= 0) {
                if (auctionData[0].extension_type === 'Cascade' || auctionData[0].extension_type === 'Individual Lots') {
                    await sqsTriggerFunction(event)
                }
            } else {
                console.log('no match')
            }
        }
        return true
    } catch (err) {
        console.log(err)
        return err
    }
}
