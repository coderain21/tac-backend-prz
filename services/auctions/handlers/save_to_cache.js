/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable consistent-return */
/* eslint-disable no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/no-extraneous-dependencies */
const { ObjectId } = require('mongodb')
const redisHelper = require('../lib/redis_helper')
const mongodbHelper = require('../lib/mongodb_helper')
const Lot = require('../entities/Lot')

let connection
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
    try {
        if (connection === null || !connection.readyState) {
            connection = await mongodbHelper.connect()
        }
        const data = typeof event === 'string' ? JSON.parse(event) : event
        const client = await redisHelper.createRedisClient()
        const redisKey = `lot:${data._id}`
        let endDateISO
        const redisPayload = JSON.stringify(data)
        const lotDetails = await mongodbHelper.view(Lot, {
            _id: new ObjectId(data._id),
        })
        if (data && data.lot_end_time) {
            endDateISO = new Date(data.lot_end_time).toISOString()
            data.extended = false
            data.lot_extended = false
        } else {
            redisPayload.winning_user = redisPayload.winning_user || ''
            endDateISO = new Date(data.end_date).toISOString()
            data.extended = true
            data.lot_extended = true
            redisPayload.starting_price = lotDetails.starting_price
            await client.hset('lot', redisKey, redisPayload)
        }
        data.end_date = endDateISO

        // Calculate delay_seconds = (lot_number - 1) * 10
        const lot_number = data.lot_number || 1 // Default to 1 if lot_number is missing
        const delay_seconds = (lot_number - 1) * 10
        data.delay_seconds = delay_seconds
        return { ...data }
    } catch (e) {
        return e
    }
}
