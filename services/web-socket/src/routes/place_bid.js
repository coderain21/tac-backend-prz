/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-param-reassign */
/* eslint-disable no-trailing-spaces */
/* eslint-disable no-multiple-empty-lines */
/* eslint-disable import/no-extraneous-dependencies */
const { promisify } = require('util')

const mongoose = require('mongoose')
const redis = require('redis')

const mongodbHelper = require('../utilities/mongodb_helper')
const helper = require('../utilities/auto_bid')



// Check if the client is closed


const bidInformationSchema = new mongoose.Schema({
    socket_id: String,
    buyer_id: String,
    auction_id: String,
    seller_email: String,
    paddle_number: Number,
    starting_bid: Number,
    max_bid: Number,
    lot_id: String,
    current_bid_amount: Number,
    low_estimate: String,
    high_estimate: String,
    top_bidder: String,
    bid_status: String,
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    base_price: Number,
})

const BidInformation = mongoose.model('dev-bid-information', bidInformationSchema)

async function getAllRecordsForAuctionId(data, client) {
    try {
        const key = `auction:${data.auction_id}`
        const excludedIds = [`${data.buyer_id}`]
    
        const recordsHash = await client.hGetAll(key)
        const records = []
      
        for (const field in recordsHash) {
            const record = JSON.parse(recordsHash[field])
            // Check if the buyer ID is in the list of excluded IDs
            if (!excludedIds.includes(record.buyer_id)) {
                records.push(record)
            }
        }
      
        return records
    } catch (err) {
        console.log('err', err)
        return err
    }
}

module.exports.placeBid = async (socket, data, io, userData) => {
    try {
        data.socket_id = socket.id
        // Use const for client since it doesn't change
        // const client = redis.createClient()
        const client = redis.createClient({
            host: 'dev-redis.68b9d9.ng.0001.euw2.cache.amazonaws.com',
            port: 6379,
            // Add any other necessary configuration options here
        })
        const hSetAsync = promisify(client.hSet).bind(client)
        if (!client.isOpen) {
            // Reconnect to Redis
            await client.connect()
        }
        const allBidders = await getAllRecordsForAuctionId(data, client)
        const checkForAutoBid = await helper.checkAutoBid(data, allBidders, client)
        console.log('chec', checkForAutoBid)
        // const { message } = checkForAutoBid
        // const { bidStatus } = checkForAutoBid
        let message = 'Congratulations, you won the bid!'
        let bidStatus

        // Connect to MongoDB outside the try block to ensure proper disconnection in case of an error
        const connectionData = await mongodbHelper.connect()
        if (allBidders.length > 0) {
            const highestBid = allBidders.reduce((maxBid, bid) => (bid.max_bid > maxBid ? bid.max_bid : maxBid), allBidders[0].max_bid)
            console.log('highest', highestBid)
            const highestBidder = allBidders.find((bid) => bid.max_bid === highestBid)
            console.log('higgestbider', highestBidder)
            console.log('checking', data.max_bid > highestBidder.base_price)
            // await mongodbHelper.updateTopBidder(data, highestBidder)
            if (data.max_bid > highestBidder.base_price) {
                bidStatus = 'Winning'
            } else {
                message = 'You did not win the bid'
                bidStatus = 'Not Winning'
            }
        } else {
            const highestBid = {
                Top_bidder: checkForAutoBid.buyer_id,
                paddle_number: checkForAutoBid.paddle_number,
                current_bid: checkForAutoBid.max_bid,
            }
            // await mongodbHelper.updateTopBidder(data, highestBid)
            bidStatus = 'Winning'
        }
        
        checkForAutoBid.record.bid_status = bidStatus
        console.log('last response', checkForAutoBid)
        const criteria = {
            buyer_id: checkForAutoBid.record.buyer_id,
            auction_id: checkForAutoBid.record.auction_id,
            lot_id: checkForAutoBid.record.lot_id,
        }
        
        const existingRecord = await BidInformation.findOne(criteria)
        if (existingRecord) {
            existingRecord.set(checkForAutoBid.record)
            await existingRecord.save()
        } else {
            const bidDoc = new BidInformation(checkForAutoBid.record)
            await bidDoc.save()
        }
        const redisRecordKey = `auction:${checkForAutoBid.record.auction_id}`
        const existingRedisRecord = await client.hGet(redisRecordKey, checkForAutoBid.record.buyer_id)
        const isNewRecord = !existingRedisRecord    
        if (isNewRecord) {
            // If no existing record is found, create a new record in Redis
            await client.hSet(redisRecordKey, checkForAutoBid.record.buyer_id, JSON.stringify(checkForAutoBid.record))
        } else {
            // If an existing record is found, update it in Redis
            await client.hSet(redisRecordKey, checkForAutoBid.record.buyer_id, JSON.stringify(checkForAutoBid.record))
        }
        console.log('bid status', message)
        if (bidStatus) {
            const winningBidders = allBidders.filter((bidder) => bidder.bid_status === 'Winning')
            if (winningBidders.length > 0) {
                const taskListBatch = []
                winningBidders.forEach((record) => {
                    if (record.bid_status === 'Winning') {
                        console.log('entering')
                        // Assuming 'auction_id' is a unique identifier for your records in Redis
                        const redisKey = `auction:${record.auction_id}:${record.buyer_id}:${record.lot_id}`
                        const redisField = 'bid_status'
                        const redisValue = JSON.stringify({ bid_status: 'Not Winning' })
          
                        // Update the record in Redis
                        taskListBatch.push(
                            hSetAsync(redisKey, redisField, redisValue).catch((error) => {
                                console.error(`Error updating record '${redisKey}':`, error)
                            }),
                        )
          
                        console.log(`Updated ${redisKey} - ${redisField} to ${redisValue}`)
                    }
                })
          
                try {
                    const results = await Promise.all(taskListBatch)
                    console.log('Results:', results)
                } catch (error) {
                    console.error('Error updating records in Redis:', error)
                }
            }
        }
          
        console.log('Before emitting placeBid event')
        io.to(socket.id).emit('placeBid', { success: true, message })
        console.log('After emitting placeBid event')
        await connectionData.disconnect()
    } catch (err) {
        console.error(err)
    }
}
