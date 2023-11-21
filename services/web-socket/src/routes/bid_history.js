const redis = require('redis')

async function getHistory(data) {
    const client = await redis.createClient()
    const allBidders = await client.hGetAll(`auction:${data.auction_id}`, `lot:${data.lot_id}`)
    console.log('all bidder', allBidders)
    // Filter out the current bidder and return an array
    return Object.values(allBidders || {}).filter((bidder) => {
        const parsedBidder = JSON.parse(bidder)
        return parsedBidder
    })
}
module.exports.listBidHistory = async (socket, data, io) => {
    try {
        const listData = await getHistory(data)
        io.to(data.lot_id).emit('placeBid', {
            success: true, listData,
        })
    } catch (err) {
        io.to(data.lot_id).emit('placeBid', { success: true })
    }
}
