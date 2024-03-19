/* eslint-disable consistent-return */
/* eslint-disable no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/no-extraneous-dependencies */

const redis = require('redis')
const { createCluster } = require('redis')

async function createRedisClient() {
    try {
        const client = createCluster({
            rootNodes: [
                {
                    url: 'redis://websocket-redis-cluster-enabled.z4q2as.clustercfg.euw2.cache.amazonaws.com:6379',
                },
            ],
            legacyMode: true,
            useReplicas: true,
            scaleReads: 'slave',
            lazyConnect: true,
            slotsRefreshInterval: 3000,
            slotsRefreshTimeout: 10000,
            enableOfflineQueue: false,
            dnsLookup: (address, callback) => callback(null, address),
            enableReadyCheck: true,

        })
        // return client
        client.on('error', (error) => console.error(
            'getRedisClient: error occurred for ',
            error,
        ))
        // Wait for it to connect to avoid any errors.
        await client.connect()
        return client
    } catch (err) {
        console.log('errrr', err)
    }
}


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
        const data = typeof event === 'string' ? JSON.parse(event) : event
        // const client = await redis.createClient({
        //     url: process.env.REDIS_URL,
        // }).on('error', (err) => console.log('Redis Client Error', err)).connect()
        // if (!client.isOpen) {
        //     await client.connect()
        // }
        const client = await createRedisClient()
        console.log('client', client)
        const redisKey = `lot:${data._id}`
        let endDateISO
        const redisPayload = JSON.stringify(data)
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
    } catch (e) {
        return e
    }
}
