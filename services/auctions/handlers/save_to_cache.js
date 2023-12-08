/* eslint-disable no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-extraneous-dependencies */
const redis = require('redis')

/**
 * Function to save the lot to cache after auction publish
 * Retrieves auction details from Redis based on the provided lot ID.
 * updates Redis, and returns the lot details.
 *
 * @param {string} lot_id - The ID of the lot to retrieve.
 * @param {object} client - The Redis client for database interaction.
 *  @param {object} lot information - to save the lot to redis cache.
 * @returns {object} true
 */
module.exports.handler = async (event, context, callback) => {
    const data = typeof event === 'string' ? JSON.parse(event) : event
    console.log('data', data)
    const client = await redis.createClient({
        url: process.env.REDIS_URL,
    }).on('error', (err) => console.log('Redis Client Error', err)).connect()
    if (!client.isOpen) {
        await client.connect()
    }
    const redisKey = `lot:${data._id}`
    let endDateISO
    const redisPayload = JSON.stringify(data)
    console.log('redisPayload', redisPayload)
    if (data && data.lot_end_time) {
        endDateISO = new Date(data.lot_end_time).toISOString()
        data.extended = false
        data.lot_extended = false
    } else {
        endDateISO = new Date(data.end_date).toISOString()
        data.extended = true
        data.lot_extended = true
        await client.hSet('lot', redisKey, redisPayload)
    }
    console.log('end', endDateISO, data)
    data.end_date = endDateISO
    return { ...data }
}
