const redis = require('redis')

module.exports.handler = async (event) => {
    console.log('event', event)
    // console.log('REDIS KEY', rediskey)
    // const allBidders = await client.hGetAll('lot', rediskey)
    // // Filter out the current bidder and return an array
    // return Object.values(allBidders || {}).filter((bidder) => {
    //     console.log('bidder', bidder)
    //     const parsedBidder = JSON.parse(bidder)
    //     console.log('consoit', parsedBidder._id)
    //     return parsedBidder._id === lotID
    // })
}
