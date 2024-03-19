/* eslint-disable consistent-return */
/* eslint-disable import/no-extraneous-dependencies */
const { createCluster } = require('redis')

module.exports.createRedisClient = async () => {
    try {
        const client = createCluster({
            rootNodes: [
                {
                    url: process.env.REDIS_CLUSTER_CONNECTION_URL,
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
