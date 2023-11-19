/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-unresolved */
/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-param-reassign */
/* eslint-disable no-trailing-spaces */
/* eslint-disable no-multiple-empty-lines */
/* eslint-disable import/no-extraneous-dependencies */
const { promisify } = require('util')
const webpush = require('web-push')


const mongoose = require('mongoose')
const redis = require('redis')

const mongodbHelper = require('../utilities/mongodb_helper')
const helper = require('../utilities/auto_bid')
const { checkExtensionType } = require('../utilities/extension_lots')




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
        const excludedIds = [] // Remove sandhyashri@7edge.com    
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
        // const client = await redis.createClient({
        //     url: 'redis://dev-redis.68b9d9.ng.0001.euw2.cache.amazonaws.com:6379',
        // }).on('error', (err) => console.log('Redis Client Error', err)).connect()
        const client = await redis.createClient()
        const hSetAsync = promisify(client.hSet).bind(client)
        if (!client.isOpen) {
            await client.connect()
        }
        const allBidders = await getAllRecordsForAuctionId(data, client)
        console.log('all', allBidders)
        const checkForAutoBid = await helper.checkAutoBid(data, allBidders, client)
        let message = 'Congratulations, you won the bid!'
        let bidStatus

        // Connect to MongoDB outside the try block to ensure proper disconnection in case of an error
        // const connectionData = await mongodbHelper.connect()
        if (allBidders.length > 0) {
            const highestBid = allBidders.reduce((maxBid, bid) => (bid.max_bid > maxBid ? bid.max_bid : maxBid), allBidders[0].max_bid)
            const highestBidder = allBidders.find((bid) => bid.max_bid === highestBid)
            // await mongodbHelper.updateTopBidder(data, highestBidder)
            if (highestBidder.base_price > data.max_bid) {
                bidStatus = 'Winning'
            } else {
                message = 'You did not win the bid'
                bidStatus = 'Not Winning'
            }
        } else {
            // const highestBid = {
            //     Top_bidder: checkForAutoBid.buyer_id,
            //     paddle_number: checkForAutoBid.paddle_number,
            //     current_bid: checkForAutoBid.max_bid,
            // }
            // await mongodbHelper.updateTopBidder(data, highestBid)
            bidStatus = 'Winning'
        }        
        checkForAutoBid.record.bid_status = bidStatus
        console.log('checksfir', checkForAutoBid)
        const criteria = {
            buyer_id: checkForAutoBid.record.buyer_id,
            auction_id: checkForAutoBid.record.auction_id,
            lot_id: checkForAutoBid.record.lot_id,
        }
        
        // const existingRecord = await BidInformation.findOne(criteria)
        // if (existingRecord) {
        //     existingRecord.set(checkForAutoBid.record)
        //     await existingRecord.save()
        // } else {
        //     const bidDoc = new BidInformation(checkForAutoBid.record)
        //     await bidDoc.save()
        // }
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
        if (bidStatus) {
            try {
                const allBidders2 = await getAllRecordsForAuctionId(data, client)
                console.log('222222222222', allBidders2)
                
                const winningBidders = allBidders2.filter((bidder) => bidder.buyer_id !== data.buyer_id)
                console.log('winning', winningBidders)
        
                if (winningBidders.length > 0) {
                    const updates = {}
                    
                    for (const record of winningBidders) {
                        const bidKey = `auction:${record.auction_id}`
                        updates[bidKey] = { bid_status: 'Not Winning' }
        
                        const existingRedisRecords = await client.hGet(bidKey, record.buyer_id)
                        const isNewRecord = !existingRedisRecords
                        console.log('recordsss', isNewRecord)
        
                        const newRecord = {
                            ...record,
                            bid_status: isNewRecord ? 'Winning' : 'Not Winning',
                        }
        
                        console.log(isNewRecord ? 'newww' : 'Updating an existing record in Redis')
        
                        await client.hSet(bidKey, record.buyer_id, JSON.stringify(newRecord))
                    }
        
                    return true
                }
            } catch (err) {
                console.error('Error:', err)
                return err
            }
        }
        
        const checkExtension = await checkExtensionType(data)
        const auctionExtended = checkExtension
        io.to(socket.id).emit('placeBid', {
            success: true, message, is_auction_extended: auctionExtended, current_bid: checkForAutoBid.current_bid, 
        })
        // const token = 'ExponentPushToken[ExponentPushTokenXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX]'
        // const VAPID_SUBJECT = 'https://www.mypushnotificationapp.com'
        // // Ensure VAPID_SUBJECT is defined before calling webpush.setVapidDetails()
        // webpush.setVapidDetails(
        //     'sandhyashri@7edge.com',
        //     'BCoBeZarzs7pJkmbWdI42ZXCKQ2X5j8w6zOUUg6MvYa0dVm1onUxo9rIU0VcmW4rg0Ni4Py2_x9AJikTxgjUNZc',
        //     'Wp0NfsuQPrY26tFu91k6XOWCtDdkIGVHPt-9fK-z3SQ',
        //     VAPID_SUBJECT,
        // )
        // const payload = JSON.stringify({
        //     title: 'Bid-Placed',
        //     body: 'You won the bid',
        //     // stage: 'dev',
        //     // web_push_type: notification.data.web_push_type,
        //     // data: notification.data,
        // })
        // const pushresponse = await webpush.sendNotification(token, payload)
        // console.log('push response', pushresponse)

        // await connectionData.disconnect()
    } catch (err) {
        console.error(err)
    }
}
