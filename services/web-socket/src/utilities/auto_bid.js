/* eslint-disable no-self-assign */
/* eslint-disable camelcase */
const mongodbHelper = require('./mongodb_helper')

/* eslint-disable no-param-reassign */
async function calculateNextBid(currentBid) {
    try {
        // Extract the first digit of the current bid
        const firstDigit = parseInt(currentBid.toString()[0], 10)
        let nextBid

        if (firstDigit === 1) {
        // If the first digit is 1, increase by 10
            nextBid = currentBid + 10
        } else if (firstDigit === 2) {
        // If the first digit is 2, increase by 20
            nextBid = currentBid + 20
        } else if (firstDigit === 3 || firstDigit === 4) {
        // If the first digit is 3 or 4, follow the pattern 0 - 2 - 5 - 8
            const lastDigit = parseInt(currentBid.toString().slice(-1), 10)
            const pattern = [0, 2, 5, 8]
            const nextDigit = pattern[(pattern.indexOf(lastDigit) + 1) % pattern.length]
            nextBid = currentBid + (nextDigit - lastDigit)
        } else if (firstDigit >= 5 && firstDigit <= 9) {
        // If the first digit is 5 to 9, increase by 5
            nextBid = currentBid + 5
        } else {
        // For other cases, increase by 1
            nextBid = currentBid + 1
        }
        return nextBid
    } catch (err) {
        return err
    }
}

module.exports.checkAutoBid = async (record, all_bidders, client) => {
    const maxBidAmount = record.max_bid
    console.log('all', all_bidders)
    let message
    try {
        const getNextAmount = await calculateNextBid(record.starting_bid)
        if (all_bidders.length > 0) {
            const highestBid = Math.max(...all_bidders.map((bid) => bid.max_bid))
            const highestBidder = all_bidders.find((bid) => bid.max_bid === highestBid)
            console.log('his', highestBidder)
            if (highestBidder.base_price > record.max_bid) {
                const amount = await calculateNextBid(record.max_bid)
                record.current_bid = amount
                const redisRecordKey = `auction:${record.auction_id}`
                const existingRedisRecord = await client.hGet(redisRecordKey, highestBidder.buyer_id)
                const isNewRecord = !existingRedisRecord
                if (isNewRecord) {
                    console.log('iffff')
                    // If no existing record is found, create a new record in Redis
                    await client.hSet(redisRecordKey, highestBidder.buyer_id, JSON.stringify(record))
                } else {
                    console.log('entryyyyyyyyyyyyyyyyyyyyyyyyyyyyy')
                    // If an existing record is found, update it in Redis
                    await client.hSet(redisRecordKey, highestBidder.buyer_id, JSON.stringify(record))
                    const getBuyer = await mongodbHelper.getAllBidders(highestBidder)
                    console.log('update', getBuyer)
                    const updateBuyer = await mongodbHelper.updatingBuyer(getBuyer[0], amount)
                    console.log('update', updateBuyer)
                }
                if (record.buyer_id === highestBidder.buyer_id) {
                    record.higghest_bidder = record.buyer_id
                } else {
                    record.higghest_bidder = highestBidder.buyer_id
                }
            } else {
                const amount = await calculateNextBid(record.max_bid)
                record.higghest_bidder = record.buyer_id
                record.max_bid = record.max_bid
                record.base_price = record.max_bid
                record.current_bid = amount
            }
        } else if (getNextAmount !== record.max_bid) {
            record.max_bid = getNextAmount
            record.base_price = maxBidAmount
            record.current_bid = getNextAmount
            // record.bid_status = bidStatus
        }
        // await mongodbHelper.changeStartingBid(record)
        return { record, message }
    } catch (error) {
        console.error(error)
        return false
    }
}
