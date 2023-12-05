/* eslint-disable import/no-extraneous-dependencies */
const redis = require('redis')

module.exports.handler = async (event, context, callback) => {
    console.log('event', event, typeof event, 'type data', JSON.parse(event))
    const data = JSON.parse(event)
    const client = await redis.createClient({
        url: 'redis://dev-redis.68b9d9.ng.0001.euw2.cache.amazonaws.com:6379',
    }).on('error', (err) => console.log('Redis Client Error', err)).connect()
    // Check if the Redis client is not open, then connect
    if (!client.isOpen) {
        await client.connect()
    }
    const redisKey = `lot:${data._id}`
    const x = await client.hSet('lot', redisKey, JSON.stringify(data))
    console.log('xxxx', x, data.end_date)
    // return callback(null, { expirydate: 1701787500000, ...data })
    // return callback(null, event)
    return { end_date: new Date(data.end_date).toISOString(), ...data}
}
