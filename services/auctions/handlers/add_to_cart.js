/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
const redis = require('redis')
const mongodbHelper = require('../lib/mongodb_helper')
const { sqsTriggerFunction } = require('./sqs_trigger_function')

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
    const rediskey = `lot:${event._id}`
    const client = await redis.createClient({
        url: process.env.REDIS_URL,
    }).on('error', (err) => console.log('Redis Client Error', err)).connect()
    // Check if the Redis client is not open, then connect
    if (!client.isOpen) {
        await client.connect()
    }
    const getLotInfo = await getLot(rediskey, client, event._id)
    const auctionData = await mongodbHelper.getAuction(event, process.env.TABLE_NAME)
    console.log('auction info', auctionData)
    const saveToCart = await mongodbHelper.lotToCart(JSON.parse(getLotInfo), auctionData)
    console.log(saveToCart)
    const currentTimestamp = new Date().getTime()
    console.log('currentTimestamp', currentTimestamp)
    const getLots = await mongodbHelper.getAuctionsLots(event, currentTimestamp)
    if (getLots.length > 0) {
        const callSQS = await sqsTriggerFunction(event)
        console.log('callSQS', callSQS)
    } else {
        console.log('no match')
    }
    return true
}
