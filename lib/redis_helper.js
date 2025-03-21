/* eslint-disable no-plusplus */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-promise-executor-return */
/* eslint-disable no-restricted-syntax */
/* eslint-disable camelcase */
/* eslint-disable no-param-reassign */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
/* eslint-disable consistent-return */
/* eslint-disable import/no-extraneous-dependencies */
// const { createCluster } = require('redis')s
const Redis = require('ioredis')
// const request = require('request')
const axios = require('axios')

// const currentTimeEpoch = Date.now()

/**
 * Create a Redis cluster client
 *
 * @returns {Object} Redis cluster client
 */
module.exports.createRedisClient = async () => {
    const maxRetries = 5
    const baseDelay = 1000 // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const cluster = new Redis.Cluster(
                [
                    {
                        port: 6379,
                        host: process.env.REDIS_CLUSTER_ENDPOINT,
                    },
                ],
                {
                    /**
                     * Custom DNS lookup function which always returns the
                     * hostname as the IP address to avoid DNS lookup.
                     *
                     * @param {string} address The hostname of the Redis cluster
                     * @param {function} callback The callback function to call with the IP address
                     */
                    dnsLookup: (address, callback) => callback(null, address),
                    /**
                     * Time in milliseconds after which the slots map is
                     * refreshed.
                     */
                    slotsRefreshTimeout: 5000,
                    retryStrategy: (times) => {
                        const delay = Math.min(times * baseDelay, 10000) // Cap at 10 seconds
                        return delay
                    },
                },
            )
            /**
             * Handle errors emitted by the Redis cluster client
             *
             * @param {Error} error The error object
             */
            cluster.on('error', async (error) => {
                console.error('getRedisClient: error occurred for ', error)
                try {
                    await cluster.disconnect()
                    await cluster.connect()
                } catch (reconnectError) {
                    console.error('Failed to reconnect:', reconnectError)
                }
            })
            // await cluster.connect()
            return cluster
        } catch (err) {
            console.log(`Redis connection attempt ${attempt} failed:`, err)
            if (attempt === maxRetries) {
                throw new Error(`Failed to connect to Redis after ${maxRetries} attempts`)
            }
            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * baseDelay))
        }
    }
}

async function sendEmits(payload) {
    try {
        const headersList = {
            Accept: '*/*',
            'User-Agent': 'API TEST',
            'Content-Type': 'application/json',
        }
        const reqUrl = `${process.env.SOCKET_URL}/notification`
        await axios.post(reqUrl, payload, { headers: headersList })
    } catch (err) {
        console.log('emiterr', err)
    }
}
/*
The function begins by setting the initial end time of the lot based on its end date.
It checks if the Redis client is open and connects if it is not.
It retrieves existing information about the lot from Redis using the lot's ID.
The existing record is parsed, and a new set of information is created for updating, including extending the lot's end date and marking it as extended.
The updated information is then stored back in the Redis database.
Additional data about the lot and the auction extension is prepared.
An extension alert is sent using a custom function (extensionAlert) with information about the extended lot.
A socket event is emitted to join a bid room, and the function returns true on successful execution.
*/

async function findAndUpdateTime(lotInformation, client) {
    try {
        lotInformation.initial_end_time = lotInformation.end_date
        const lot_id = lotInformation._id.toString()
        const bidKey = `lot:${lot_id}`
        const existingRecord = await client.hget('lot', bidKey)
        const get_lot = JSON.parse(existingRecord)
        const updateRequest = {
            ...get_lot,
            lot_end_date: lotInformation.lot_end_time,
            end_date: lotInformation.lot_end_time,
        }
        updateRequest.winning_user = updateRequest.winning_user || ''
        const updatePromise = client
            .multi()
            .hset('lot', bidKey, JSON.stringify(updateRequest))
            .exec()
        const payload = { lots: updateRequest }
        await Promise.all([updatePromise, sendEmits(payload)])

        // return new Promise((resolve, reject) => {
        //     const options = {
        //         method: 'POST',
        //         url: reqUrl,
        //         headers: headersList,
        //         body: JSON.stringify(payload),
        //     }

        //     request(options, (error, response) => {
        //         if (error) {
        //             console.error('Error:', error)
        //             reject(error)
        //         } else {
        //             console.log('Response:', response.statusCode)
        //             resolve(response)
        //         }
        //     })
        // })
    } catch (err) {
        console.log(err)
    }
}

/**
 * Update all lots in redis with new end time
 *
 * @param {Array} auctionLots - list of lots to update
 * @param {Object} client - Redis client object
 * @param {Number} extend_time - time to extend the lot end time in ms
 * @returns {Promise}
 */
module.exports.redisUpdateAll = async (auctionLots, client, extend_time) => {
    try {
        // Filter lots that need updating and calculate lot end times
        const lotsToUpdate = auctionLots.filter((item) => item.end_date > Date.now()).map((item) => ({
            ...item,
            lot_end_time: item.end_date + extend_time,
        }))

        // Update Redis for all lots in parallel
        await Promise.all(lotsToUpdate.map((item) => findAndUpdateTime(item, client)))
    } catch (err) {
        console.error('Redis Update Error:', err)
        throw err // Rethrow the error for proper handling in the caller
    }
}
