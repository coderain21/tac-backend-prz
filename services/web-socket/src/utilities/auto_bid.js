/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
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

async function updateCurrentBidAmounts(records, newBidAmount, client, maximumBid) {
    try {
        const updates = {}
        for (const record of records) {
            if (maximumBid !== 0) {
                record.max_bid = maximumBid // Update max_bid in the record
            } else {
                record.max_bid = record.max_bid
            }

            const bidKey = `auction:${record.auction_id}`
            updates[bidKey] = { current_bid: newBidAmount }
            const existingRedisRecord = await client.hGet(bidKey, record.buyer_id)
            const isNewRecord = !existingRedisRecord

            if (isNewRecord) {
                const newRecord = { ...record, current_bid: newBidAmount } // Create a new record with updated values
                await client.hSet(bidKey, record.buyer_id, JSON.stringify(newRecord))
            } else {
                const existingRecord = JSON.parse(existingRedisRecord)
                existingRecord.current_bid = newBidAmount // Update current_bid in the existing record
                existingRecord.max_bid = maximumBid // Update max_bid in the existing record
                await client.hSet(bidKey, record.buyer_id, JSON.stringify(existingRecord))
            }
        }

        return true
    } catch (err) {
        console.error('Error:', err)
        return err
    }
}

module.exports.checkAutoBid = async (record, all_bidders, client) => {
    const latestRecordId = record
    const maxBidAmount = record.max_bid
    let message
    let maximumBid = 0
    try {
        const getNextAmount = await calculateNextBid(record.starting_bid)
        const otherUser = all_bidders.filter((bid) => bid.buyer_id !== record.buyer_id)
        console.log('otheruser', otherUser)
        if (all_bidders.length > 0) {
            const highestBid = Math.max(...all_bidders.map((bid) => bid.max_bid))
            console.log('highet', highestBid)
            const highestBidder = all_bidders.find((bid) => bid.max_bid === highestBid)
            console.log('higgest', highestBidder)
            if (highestBidder.base_price > record.max_bid) {
                console.log('insidee')
                const amount = await calculateNextBid(record.max_bid)
                const saveBidder = record
                saveBidder.max_bid = amount
                saveBidder.buyer_id = highestBidder.buyer_id
                const userAmount = await calculateNextBid(amount)
                saveBidder.current_bid = userAmount
                const redisRecordKey = `auction:${record.auction_id}`
                const existingRedisRecord = await client.hGet(redisRecordKey, highestBidder.buyer_id)
                const getOtherBidder = await client.hGet(redisRecordKey, record.buyer_id)
                console.log('get', getOtherBidder)
                const isNewRecord2 = !getOtherBidder
                const isNewRecord = !existingRedisRecord
                if (isNewRecord) {
                    // If no existing record is found, create a new record in Redis
                    await client.hSet(redisRecordKey, highestBidder.buyer_id, JSON.stringify(saveBidder))
                } else {
                    // If an existing record is found, update it in Redis
                    await client.hSet(redisRecordKey, highestBidder.buyer_id, JSON.stringify(saveBidder))
                    // const getBuyer = await mongodbHelper.getAllBidders(highestBidder)
                    // await mongodbHelper.updatingBuyer(getBuyer[0], amount)
                }
                const x = record
                x.current_bid = userAmount

                if (isNewRecord2) {
                    // If no existing record is found, create a new record in Redis
                    await client.hSet(redisRecordKey, record.buyer_id, JSON.stringify(saveBidder))
                } else {
                    // If an existing record is found, update it in Redis
                    await client.hSet(redisRecordKey, highestBidder.buyer_id, JSON.stringify(saveBidder))
                    // const getBuyer = await mongodbHelper.getAllBidders(highestBidder)
                    // await mongodbHelper.updatingBuyer(getBuyer[0], amount)
                }
                if (record.buyer_id === highestBidder.buyer_id) {
                    record.higghest_bidder = record.buyer_id
                } else {
                    record.higghest_bidder = highestBidder.buyer_id
                }
                console.log('latestRecordId', latestRecordId)
                const otherUser = all_bidders.filter((bid) => bid.buyer_id === latestRecordId.buyer_id)
                console.log('@@@@@@', otherUser)
                if (otherUser) {
                    maximumBid = latestRecordId.max_bid
                    const updateCurrentBid = await updateCurrentBidAmounts(otherUser, userAmount, client, maximumBid)
                }
            } else {
                console.log('entryyy')
                let price = highestBidder.max_bid
                if (all_bidders.length > 0) {
                    price = highestBidder.base_price
                }
                const amount = await calculateNextBid(price)
                const amount2 = await calculateNextBid(amount)
                console.log('amount 2', amount2)
                const updateCurrentBid = await updateCurrentBidAmounts(otherUser, amount2, client, maximumBid)
                record.higghest_bidder = record.buyer_id
                record.max_bid = amount
                record.base_price = maxBidAmount
                record.current_bid = amount2
            }
        } else {
            const amounts = await calculateNextBid(getNextAmount)
            console.log('heyyyyyy')
            record.max_bid = getNextAmount
            record.base_price = maxBidAmount
            record.current_bid = amounts
            // const updateCurrentBid = await updateCurrentBidAmounts(otherUser, amounts, client)
            // record.bid_status = bidStatus
        }
        // await mongodbHelper.changeStartingBid(record)
        return { record, message }
    } catch (error) {
        return error
    }
}
