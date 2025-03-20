/* eslint-disable prefer-destructuring */
/* eslint-disable no-plusplus */
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
// module.exports.createRedisClient = async () => {
//     try {
//         console.log('getRedisClient: connecting to Redis cluster...')
//         const cluster = new Redis.Cluster(
//             [
//                 {
//                     port: 6379,
//                     host: process.env.REDIS_CLUSTER_ENDPOINT,
//                     dnsLookup: (address, callback) => callback(null, address),
//                     slotsRefreshTimeout: 5000,
//                     redisOptions: {
//                         connectTimeout: 10000,
//                         retryStrategy: (times) => Math.min(times * 50, 2000),
//                         tls: true,
//                         password: '--------------------',
//                         maxRetriesPerRequest: 3,
//                         enableReadyCheck: true,
//                         clusterRetryStrategy: (times) => Math.min(times * 100, 3000),
//                     },
//                     enableOfflineQueue: false,
//                     scaleReads: 'master',
//                     redisClusterOptions: {
//                         maxRedirections: 3,
//                         retryDelayOnFailover: 300,
//                         retryDelayOnClusterDown: 1000,
//                         retryDelayOnTryAgain: 3000,
//                     },
//                 },
//             ],
//         )
//         /**
//          * Handle errors emitted by the Redis cluster client
//          *
//          * @param {Error} error The error object
//          */
//         cluster.on('error', (error) => console.error(
//             'getRedisClient: error occurred for ',
//             error,
//         ))
//         cluster.on('node error', (error, node) => {
//             console.error('Redis node  encountered error:', error)
//         })
//         // await cluster.connect()
//         return cluster
//     } catch (err) {
//         console.log('redis err', err)
//         throw err // Added error throw to propagate connection failures
//     }
// }

// module.exports.createRedisClient = async () => {
//     try {
//         console.log('getRedisClient: connecting to Redis cluster...')

//         const clusterEndpoint = process.env.REDIS_CLUSTER_ENDPOINT || 'clustercfg.new-websocket-redis-auth-cluster-enabled.ocwjs7.euw2.cache.amazonaws.com:6379'

//         const cluster = new Redis.Cluster(
//             [
//                 {
//                     port: 6379,
//                     host: clusterEndpoint,
//                     dnsLookup: (address, callback) => callback(null, address),
//                 },
//             ],
//             {
//                 slotsRefreshTimeout: 5000,
//                 redisOptions: {
//                     connectTimeout: 10000,
//                     retryStrategy: (times) => Math.min(times * 50, 2000),
//                     tls: true,
//                     password: '-----------------', // Replace with your actual password
//                     maxRetriesPerRequest: 3,
//                     enableReadyCheck: true,
//                 },
//                 enableOfflineQueue: false,
//                 scaleReads: 'master',
//                 clusterRetryStrategy: (times) => Math.min(times * 100, 3000),
//                 maxRedirections: 3,
//                 retryDelayOnFailover: 300,
//                 retryDelayOnClusterDown: 1000,
//                 retryDelayOnTryAgain: 3000,
//             },
//         )

//         cluster.on('error', (error) => console.error(
//             'getRedisClient: error occurred for ',
//             error,
//         ))

//         cluster.on('node error', (error, node) => {
//             console.error('Redis node encountered error:', error)
//         })

//         return cluster
//     } catch (err) {
//         console.log('redis err', err)
//         throw err
//     }
// }

// module.exports.createRedisClient = async () => {
//     try {
//         console.log('getRedisClient: connecting to Redis cluster...')

//         const cluster = new Redis.Cluster(
//             [{
//                 host: process.env.REDIS_CLUSTER_ENDPOINT,
//                 port: 6379,
//             }],
//             {
//                 dnsLookup: (address, callback) => callback(null, address),
//                 redisOptions: {
//                     tls: true,
//                     password: '-------------', // Your actual password
//                     connectTimeout: 10000,
//                     retryStrategy: (times) => Math.min(times * 50, 2000),
//                 },
//                 enableOfflineQueue: false,
//                 scaleReads: 'master',
//                 clusterRetryStrategy: (times) => Math.min(times * 100, 3000),
//                 maxRedirections: 3,
//             },
//         )

//         cluster.on('error', (error) => console.error(
//             'getRedisClient: error occurred for ',
//             error,
//         ))

//         cluster.on('node error', (error, node) => {
//             console.error('Redis node encountered error:', error)
//         })

//         return cluster
//     } catch (err) {
//         console.log('redis err', err)
//         throw err
//     }
// }
module.exports.createRedisClient = async () => {
    try {
        console.log('getRedisClient: connecting to Redis cluster...')

        // Remove port from endpoint if it's included
        // const clusterEndpoint = process.env.REDIS_CLUSTER_ENDPOINT

        const cluster = new Redis.Cluster(
            [{
                port: 6379,
                host: 'clustercfg.new-websocket-redis-auth-cluster-enabled.ocwjs7.euw2.cache.amazonaws.com:6379',
            }], // Simplest possible configuration
            {
                dnsLookup: (address, callback) => callback(null, address),
                redisOptions: {
                    tls: true,
                    password: '------------',
                },
            },
        )

        // Add error handlers
        cluster.on('error', (error) => console.error('Redis cluster error:', error))
        cluster.on('node error', (error, node) => console.error('Redis node error:', error))

        return cluster
    } catch (err) {
        console.log('redis err', err)
        throw err
    }
}
// module.exports.createRedisClient = async () => {
//     try {
//         console.log('getRedisClient: connecting to Redis cluster...')

//         // Use the configuration endpoint for initial discovery
//         const endpoint = 'clustercfg.new-websocket-redis-auth-cluster-enabled.8897979js7.euw2.cache.amazonaws.com'
//         const port = 6379

//         // First create a single client to discover the topology
//         const singleClient = new Redis({
//             host: endpoint,
//             port,
//             password: '----------', // Your actual password
//             tls: true,
//         })

//         // Get cluster slots to discover nodes
//         const nodes = []
//         try {
//             const slots = await singleClient.cluster('slots')
//             await singleClient.quit()

//             // Process the slots information to extract node addresses
//             slots.forEach((slot) => {
//                 // Each slot contains info about master and replicas
//                 // Format: [start_slot, end_slot, [master_host, master_port], [replica1_host, replica1_port], ...]
//                 for (let i = 2; i < slot.length; i++) {
//                     const node = slot[i]
//                     nodes.push({
//                         host: node[0],
//                         port: node[1],
//                     })
//                 }
//             })

//             console.log('Discovered nodes:', nodes)
//         } catch (err) {
//             console.error('Failed to discover cluster topology:', err)
//             await singleClient.quit()
//             throw err
//         }

//         // Now create a cluster client with the discovered nodes
//         const cluster = new Redis.Cluster(nodes, {
//             redisOptions: {
//                 tls: true,
//                 password: '82052Py1ZgXQ20QYYaHc', // Your actual password
//                 connectTimeout: 10000,
//                 retryStrategy: (times) => Math.min(times * 50, 2000),
//             },
//             scaleReads: 'master',
//             clusterRetryStrategy: (times) => Math.min(times * 100, 3000),
//         })

//         cluster.on('error', (error) => console.error('getRedisClient: error occurred:', error))
//         cluster.on('node error', (error, node) => console.error('Redis node error:', error))

//         return cluster
//     } catch (err) {
//         console.log('redis err', err)
//         throw err
//     }
// }

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
