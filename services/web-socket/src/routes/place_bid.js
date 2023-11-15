/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-param-reassign */
/* eslint-disable no-trailing-spaces */
/* eslint-disable no-multiple-empty-lines */
/* eslint-disable import/no-extraneous-dependencies */
const mongoose = require('mongoose')
const redis = require('redis')

const mongodbHelper = require('../utilities/mongodb_helper')

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
    created_at: Date,
    updated_at: Date,
})

const BidInformation = mongoose.model('dev-bid-information', bidInformationSchema)

async function getAllRecordsForAuctionId(data, client) {
    const key = `auction:${data.auction_id}`
    const excludedIds = [`${data.buyer_id}`]

    const recordsHash = await client.hGetAll(key)
    console.log('record hash first', recordsHash)
    const records = []
  
    for (const field in recordsHash) {
        const record = JSON.parse(recordsHash[field])
        console.log('recordsHash 1234',record)

  
        // Check if the buyer ID is in the list of excluded IDs
        if (!excludedIds.includes(record.buyer_id)) {
            records.push(record)
        }
    }
  
    return records
}
  

  

module.exports.placeBid = async (socket, data, io, userData) => {
    try {
        data.socket_id = socket.id
        // Use const for client since it doesn't change
        const client = redis.createClient()
        if (!client.isOpen) {
            // Reconnect to Redis
            await client.connect()
        }
        const allBidders = await getAllRecordsForAuctionId(data, client)
        console.log('all', allBidders)
        let message = 'Congratulations, you won the bid!'
        let bidStatus = 'Not Winning'
        
        // Connect to MongoDB outside the try block to ensure proper disconnection in case of an error
        const connectionData = await mongodbHelper.connect()
        if (allBidders.length > 0) {
            const highestBid = allBidders.reduce((maxBid, bid) => (bid.max_bid > maxBid ? bid.max_bid : maxBid), allBidders[0].max_bid)
            const highestBidder = allBidders.find((bid) => bid.max_bid === highestBid)

            // await mongodbHelper.updateTopBidder(data, highestBidder)

            if (data.max_bid > highestBid) {
                bidStatus = 'Winning'
            } else {
                message = 'You did not win the bid'
            }
        } else {
            const highestBid = {
                Top_bidder: data.buyer_id,
                paddle_number: data.paddle_number,
                current_bid: data.max_bid,
            }
            // await mongodbHelper.updateTopBidder(data, highestBid)
            bidStatus = 'Winning'
        }
        data.bid_status = bidStatus
        const criteria = {
            buyer_id: data.buyer_id,
            auction_id: data.auction_id,
            lot_id: data.lot_id,
        }
        
        const existingRecord = await BidInformation.findOne(criteria)
        if (existingRecord) {
            existingRecord.set(data)
            await existingRecord.save()
        } else {
            const bidDoc = new BidInformation(data)
            await bidDoc.save()
        }
        const redisRecordKey = `auction:${data.auction_id}`
        const existingRedisRecord = await client.hGet(redisRecordKey, data.buyer_id)
        const isNewRecord = !existingRedisRecord    
        if (isNewRecord) {
            // If no existing record is found, create a new record in Redis
            await client.hSet(redisRecordKey, data.buyer_id, JSON.stringify(data))
        } else {
            // If an existing record is found, update it in Redis
            await client.hSet(redisRecordKey, data.buyer_id, JSON.stringify(data))
        }
        console.log('bid status', bidStatus)
        if (bidStatus === 'Winning') {
            const winningBidders = allBidders.filter((bidder) => bidder.bid_status === 'Winning')
            console.log('winn', winningBidders)
            if (winningBidders.length > 0) {
                // winningBidders.forEach((bidder) => {
                //     io.to(bidder.socket_id).emit('placeBid', { success: true, message })
                // })
                winningBidders.forEach((record) => {
                    console.log('record', record.bid_status)
                    if (record.bid_status === 'Winning') {
                        console.log('entering')
                        // Assuming 'auction_id' is a unique identifier for your records in Redis
                        const redisKey = `auction:${record.auction_id}`
                        const redisField = 'bid_status'
                        const redisValue = 'Not Winning'
                  
                        // Update the record in Redis
                        client.hSet(redisKey, redisField, redisValue, (err, reply) => {
                            if (err) {
                                console.error(err)
                            } else {
                                console.log(`Updated ${redisKey} - ${redisField} to ${redisValue}`)
                            }
                        })
                    }
                })
            }
        }
        await connectionData.disconnect()
        io.to(socket.id).emit('placeBid', { success: true, message })
    } catch (err) {
        console.error(err)
    }
}
