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
const historyHelper = require('../utilities/save-bid-history')
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
    bid_amount: Number,
    lot_id: String,
    next_bid_amount: Number,
    low_estimate: String,
    high_estimate: String,
    top_bidder: String,
    bid_status: String,
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    max_bid: Number,
})

const BidInformation = mongoose.model('dev-bid-information', bidInformationSchema)

async function calculateNextAmont(currentBid) {
    console.log('next amony', currentBid)
    const firstDigit = parseInt(currentBid.toString()[0], 10)
    let nextBid

    if (firstDigit === 1) {
        nextBid = currentBid + 10
    } else if (firstDigit === 2) {
        nextBid = currentBid + 20
    } else if (firstDigit === 3 || firstDigit === 4) {
        const lastDigit = parseInt(currentBid.toString().slice(-1), 10)
        const pattern = [0, 2, 5, 8]
        const nextDigit = pattern[(pattern.indexOf(lastDigit) + 1) % pattern.length]
        nextBid = currentBid + (nextDigit - lastDigit)
    } else if (firstDigit >= 5 && firstDigit <= 9) {
        nextBid = currentBid + 5
    } else {
        nextBid = currentBid + 1
    }

    return nextBid
}

const redisHelper = {
    async getOtherBidders(auctionId, currentBidderId, client) {
        const allBidders = await client.hGetAll(`auction:${auctionId}`)
        console.log('all bidder', allBidders)
        // Filter out the current bidder and return an array
        return Object.values(allBidders || {}).filter((bidder) => {
            const parsedBidder = JSON.parse(bidder)
            return parsedBidder.buyer_id !== currentBidderId
        })
    },
    async getBidders(auctionId, currentBidderId, highestBidderId, client) {
        const allBidders = await client.hGetAll(`auction:${auctionId}`)
        console.log('all bidder', allBidders)
        // Filter out the current bidder and return an array
        return Object.values(allBidders || {}).filter((bidder) => {
            const parsedBidder = JSON.parse(bidder)
            return parsedBidder.buyer_id !== currentBidderId && parsedBidder.buyer_id !== highestBidderId
        })
    },
    async  getCurrentBidder(bidderData, client) {
        const allBidders = await client.hGetAll(`auction:${bidderData.auction_id}`);    
        // Parse each string value into an object
        const parsedBidders = Object.values(allBidders || {}).map((bidder) => JSON.parse(bidder));
    
        // Find the current bidder by buyer_id
        return parsedBidders.find((parsedBidder) => parsedBidder.buyer_id === bidderData.buyer_id);
    },
    async changeStatus(getBidders, updateRequest, client) {
        if (getBidders.length > 0) {
            const updates = {}
            
            for (const record of getBidders) {
                const bidKey = `auction:${record.auction_id}`
                updates[bidKey] = updateRequest
                const newRecord = {
                    ...record,
                    bid_status: updateRequest.bid_status,
                    next_bid_amount: updateRequest.next_bid_amount,
                }        
                await client.hSet(bidKey, record.buyer_id, JSON.stringify(newRecord))
            }
            return true
        }
        return true
    },
    async saveCurrentBidder(bidder, client) {
        await client.hSet(`auction:${bidder.auction_id}`, bidder.buyer_id, JSON.stringify(bidder))
    },
    async saveOtherBidder(bidder, client) {
        await client.hSet(`auction:${bidder.auction_id}`, bidder.buyer_id, JSON.stringify(bidder))
    },
    async saveBidder(currentBidder, client, allBidder) {
        if (allBidder.length > 0) {
            const highestBid = allBidder.reduce((maxBid, bid) => (bid.max_bid > maxBid ? bid.max_bid : maxBid), allBidder[0].max_bid)
            let highestBidder = allBidder.find((bid) => bid.max_bid === highestBid)
            highestBidder = JSON.parse(highestBidder)
            const currentBidderData = await this.getCurrentBidder(currentBidder, client)
            let maxBid
            if (currentBidderData.max_bid !== undefined && currentBidder.max_bid > currentBidder.bid_amount) {
                maxBid = currentBidder.max_bid
            } else {
                maxBid = currentBidder.bid_amount
            }
            if (highestBidder.max_bid > currentBidder.bid_amount && highestBidder.max_bid > maxBid) {
                console.log('inside')
                highestBidder.bid_status = 'Winning'
                highestBidder.bid_amount = highestBidder.max_bid > currentBidder.bid_amount ? await calculateNextAmont(currentBidder.bid_amount) : await calculateNextAmont(currentBidder.max_bid)
                highestBidder.next_bid_amount = await calculateNextAmont(highestBidder.bid_amount)
                console.log('before save highest bidder', highestBidder)
                const updateHighestBidder = await this.saveOtherBidder(highestBidder, client)
                currentBidder.bid_status = 'Not Winning'
                currentBidder.next_bid_amount = highestBidder.next_bid_amount
                console.log('before current user save', currentBidder)
                const updateCurrentBidder = await this.saveCurrentBidder(currentBidder, client)
                const getBidders = await this.getBidders(currentBidder.auction_id, currentBidder.buyer_id, highestBidder.buyer_id, client)
                const updateOtherBidder = await this.changeStatus(getBidders, { bid_status: 'Not Winning', next_bid_amount: highestBidder.next_bid_amount }, client)
            } else if (highestBidder.max_bid < currentBidder.bid_amount && highestBidder.max_bid < maxBid) {
                highestBidder.bid_status = 'Not Winning'
                currentBidder.bid_status = 'Winning'
                currentBidder.bid_amount = await calculateNextAmont(highestBidder.max_bid)
                currentBidder.next_bid_amount = await calculateNextAmont(currentBidder.bid_amount)
                highestBidder.next_bid_amount = currentBidder.next_bid_amount 
                console.log('before save highest bidder', highestBidder)
                console.log('before current user save', currentBidder)
                const updateHighestBidder = await this.saveOtherBidder(highestBidder, client)
                const updateCurrentBidder = await this.saveCurrentBidder(currentBidder, client)
                const getBidders = await this.getBidders(currentBidder.auction_id, currentBidder.buyer_id, highestBidder.buyer_id, client)
                const updateOtherBidder = await this.changeStatus(getBidders, { bid_status: 'Not Winning', next_bid_amount: currentBidder.next_bid_amount}, client)
            } else {
                console.log('nothinggg')
            }
        } else {
            console.log('current', currentBidder)
            // Only one bidder
            currentBidder.bid_status = 'Winning'
            currentBidder.max_bid = currentBidder.bid_amount > currentBidder.starting_bid ? currentBidder.bid_amount : 0
            currentBidder.bid_amount = currentBidder.bid_amount > currentBidder.starting_bid ? await calculateNextAmont(currentBidder.starting_bid) : currentBidder.bid_amount
            currentBidder.next_bid_amount = await calculateNextAmont(currentBidder.bid_amount)
            const saveData = await this.saveCurrentBidder(currentBidder, client)
        }
    },
}

module.exports.placeBid = async (socket, data, io, userData) => {
    try {
        console.log('socket', data)
        data.socket_id = socket.id
        // const client = await redis.createClient({
        //     url: 'redis://dev-redis.68b9d9.ng.0001.euw2.cache.amazonaws.com:6379',
        // }).on('error', (err) => console.log('Redis Client Error', err)).connect()
        const client = await redis.createClient()
        if (!client.isOpen) {
            await client.connect()
        }
        const allBidders = await redisHelper.getOtherBidders(data.auction_id, data.buyer_id, client)
        const saveBidder = await redisHelper.saveBidder(data, client, allBidders)
        const saveBid = await historyHelper.saveBidHistory(data)

        return
        const checkForAutoBid = await helper.checkAutoBid(data, allBidders, client)
        console.log('checkForAutoBid', checkForAutoBid)
        let message = 'Congratulations, you won the bid!'
        let bidStatus
        // Connect to MongoDB outside the try block to ensure proper disconnection in case of an error
        const connectionData = await mongodbHelper.connect()
        if (allBidders.length > 0) {
            const highestBid = allBidders.reduce((maxBid, bid) => (bid.max_bid > maxBid ? bid.max_bid : maxBid), allBidders[0].max_bid)
            const highestBidder = allBidders.find((bid) => bid.max_bid === highestBid)
            console.log('highest bidder', highestBidder, highestBidder.base_price, data.max_bid)
            // await mongodbHelper.updateTopBidder(data, highestBidder)
            if (highestBidder.base_price > data.max_bid) {
                message = 'You did not win the bid'
                bidStatus = 'Not Winning'
            } else {
                message = 'Congratulations, you won the bid!'
                bidStatus = 'Winning'
            }
        } else {
            // const highestBid = {
            //     Top_bidder: checkForAutoBid.buyer_id,
            //     paddle_number: checkForAutoBid.paddle_number,
            //     current_bid: checkForAutoBid.max_bid,
            // }
            // await mongodbHelper.updateTopBidder(data, highestBid)
            message = 'Congratulations, you won the bid!'
            bidStatus = 'Winning'
        }      
        console.log('bid sttaus', bidStatus)
        checkForAutoBid.record.bid_status = bidStatus
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
        if (bidStatus) {
            try {
                const allBidders2 = await getAllRecordsForAuctionId(data, client)                
                const winningBidders = allBidders2.filter((bidder) => bidder.buyer_id !== data.buyer_id)        
                if (winningBidders.length > 0) {
                    const updates = {}
                    
                    for (const record of winningBidders) {
                        const bidKey = `auction:${record.auction_id}`
                        updates[bidKey] = { bid_status: 'Not Winning' }
        
                        const existingRedisRecords = await client.hGet(bidKey, record.buyer_id)
                        const isNewRecord = !existingRedisRecords        
                        const newRecord = {
                            ...record,
                            bid_status: isNewRecord ? 'Winning' : 'Not Winning',
                        }        
                        await client.hSet(bidKey, record.buyer_id, JSON.stringify(newRecord))
                    }
        
                    return true
                }
            } catch (err) {
                return err
            }
        }
        
        const checkExtension = await checkExtensionType(data)
        const auctionExtended = checkExtension
        io.to(data.lot_id).emit('placeBid', {
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

        await connectionData.disconnect()
    } catch (err) {
        console.error(err)
    }
}
