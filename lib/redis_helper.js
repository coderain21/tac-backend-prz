/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
/* eslint-disable consistent-return */
/* eslint-disable import/no-extraneous-dependencies */
// const { createCluster } = require('redis')s
const Redis = require('ioredis')

// module.exports.createRedisClient = async () => {
//     try {
//         const client = createCluster({
//             rootNodes: [
//                 {
//                     url: process.env.REDIS_CLUSTER_CONNECTION_URL,
//                 },
//             ],
//             legacyMode: true,
//             useReplicas: true,
//             scaleReads: 'slave',
//             lazyConnect: true,
//             slotsRefreshInterval: 3000,
//             slotsRefreshTimeout: 10000,
//             enableOfflineQueue: false,
//             dnsLookup: (address, callback) => callback(null, address),
//             enableReadyCheck: true,

//         })
//         // return client
//         client.on('error', (error) => console.error(
//             'getRedisClient: error occurred for ',
//             error,
//         ))
//         // Wait for it to connect to avoid any errors.
//         await client.connect()
//         return client
//     } catch (err) {
//         console.log('errrr', err)
//     }
// }

module.exports.createRedisClient = async () => {
    try {
        const cluster = new Redis.Cluster(
            [
                {
                    port: 6379,
                    host: process.env.REDIS_CLUSTER_ENDPOINT,
                },
            ],
            {
                dnsLookup: (address, callback) => callback(null, address),
                slotsRefreshTimeout: 5000,
            },
        )
        cluster.on('error', (error) => console.error(
            'getRedisClient: error occurred for ',
            error,
        ))
        // await cluster.connect()
        return cluster
    } catch (err) {
        console.log('redis err', err)
    }
}
