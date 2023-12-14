/* eslint-disable consistent-return */
/* eslint-disable no-console */
/* eslint-disable camelcase */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-plusplus */
const redis = require('redis')

async function getHistory(data) {
    // const client = await redis.createClient()
    const client = await redis.createClient({
        url: 'redis://dev-redis.68b9d9.ng.0001.euw2.cache.amazonaws.com:6379',
    }).on('error', (err) => console.log('Redis Client Error', err)).connect()
    if (!client.isOpen) {
        await client.connect()
    }
    const allBidders = await client.hGetAll(`auction:${data.auction_id}#${data.lot_id}`)
    // Filter out the current bidder and return an array
    return Object.values(allBidders || {}).filter((bidder) => {
        const parsedBidder = JSON.parse(bidder)
        return parsedBidder
    })
}

module.exports.listBidHistory = async (socket, data, io) => {
    try {
        const listData = await getHistory(data)
        const all_bidders = []
        for (let i = 0; i < listData.length; i++) {
            all_bidders.push(JSON.parse(listData[i]))
        }
        io.to(data.lot_id).emit('listBidHistory', {
            success: true, all_bidders,
        })
    } catch (err) {
        return err
    }
}
