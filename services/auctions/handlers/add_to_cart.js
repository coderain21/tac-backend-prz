/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
const redis = require('redis')
const mongodbHelper = require('../lib/mongodb_helper')

async function getLot(rediskey, client, id) {
    const allBidders = await client.hGetAll('lot', rediskey)
    return Object.values(allBidders || {}).filter((bidder) => {
        const parsedBidder = JSON.parse(bidder)
        return parsedBidder._id === id
    })
}

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
    console.log('getLotInfo', getLotInfo)
    const auctionData = await mongodbHelper.getAuction(event)
    console.log('auction ', auctionData)
    const saveToCart = await mongodbHelper.lotToCart(JSON.parse(getLotInfo), auctionData)
    console.log(saveToCart)
    return true
}
