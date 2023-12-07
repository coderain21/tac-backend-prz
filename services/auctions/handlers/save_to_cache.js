/* eslint-disable no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-extraneous-dependencies */
const redis = require('redis')

module.exports.handler = async (event, context, callback) => {
    console.log('event', event)
    const data = JSON.parse(event)
    const client = await redis.createClient({
        url: process.env.REDIS_URL,
    }).on('error', (err) => console.log('Redis Client Error', err)).connect()
    if (!client.isOpen) {
        await client.connect()
    }
    const redisKey = `lot:${data._id}`
    event.extended = false
    await client.hSet('lot', redisKey, event)
    const endDateISO = new Date(data.end_date).toISOString()
    console.log('end', endDateISO)
    data.end_date = endDateISO
    return { ...data }
}
