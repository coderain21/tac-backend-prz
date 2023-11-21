/* eslint-disable no-mixed-operators */
/* eslint-disable consistent-return */
/* eslint-disable no-self-assign */
/* eslint-disable no-console */
/* eslint-disable no-unused-vars */
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

const mongodbHelpers = require('../utilities/mongodb_helper')
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
    const firstDigit = parseInt(currentBid.toString()[0], 10)
    let nextBid

    if (firstDigit === 1) {
        nextBid = parseInt(currentBid, 10) + 10
    } else if (firstDigit === 2) {
        nextBid = parseInt(currentBid, 10) + 20
    } else if (firstDigit === 3 || firstDigit === 4) {
        let increment
        let lastDigit
        if (currentBid.length === 1) {
            lastDigit = parseInt(currentBid.toString().slice(-1), 10)
        } else {
            lastDigit = parseInt(currentBid.toString()[1], 10)
        }
        if (lastDigit < 2) {
            increment = 2
        } else if (lastDigit < 5) {
            increment = 5
        } else if (lastDigit < 8) {
            increment = 8
        } else {
            increment = 10
        }
        if (increment <= 8) {
            const multiplier = 10 ** (currentBid.length - 2) // return remainingBid * multiplier;
            nextBid = currentBid.toString()[0] + (increment * multiplier).toString()
        } else if (currentBid[1] === '5') {
            const roundedBid = 10 ** (currentBid.length - 1)
            nextBid = Math.ceil(parseInt(currentBid, 10) / roundedBid) * roundedBid
        } else {
            const number = parseInt(currentBid, 10)
            let roundedValue = Math.ceil(number / 500) * 500
    
            while (roundedValue % 10000 !== 5000) {
                roundedValue += 500
            }
                
            nextBid = roundedValue
        }
    } else if (firstDigit >= 5 && firstDigit <= 9) {
        const increment = 5 - (parseInt(currentBid, 10) % 10) % 5
        nextBid = parseInt(currentBid, 10) + increment
    } else {
        nextBid = parseInt(currentBid, 10) + 1
    }
    return parseInt(nextBid, 10)
}
const mongodbHelper = {
    async saveToMongoDB(bidderInfo) {
        await BidInformation.findOneAndUpdate(
            { auction_id: bidderInfo.auction_id, buyer_id: bidderInfo.buyer_id },
            { $set: bidderInfo },
            { upsert: true, new: true },
        )
    },
    async updateOtherBidder(bidder) {
        // Create or update MongoDB document
        await BidInformation.findOneAndUpdate(
            { auction_id: bidder.auction_id, buyer_id: bidder.buyer_id },
            { $set: bidder },
            { upsert: true, new: true },
        )
    },
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
        try {
            console.log('getting current user')
            const allBidders = await client.hGetAll(`auction:${bidderData.auction_id}`)    
            // Parse each string value into an object
            const parsedBidders = Object.values(allBidders || {}).map((bidder) => JSON.parse(bidder))
            const x = parsedBidders.find((parsedBidder) => parsedBidder.buyer_id === bidderData.buyer_id)
            console.log('heyyyy', x)
            if (x === undefined) {
                return false
            }
            // Find the current bidder by buyer_id
            return parsedBidders.find((parsedBidder) => parsedBidder.buyer_id === bidderData.buyer_id)
        } catch (err) {
            return {}
        }
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
        const connectionData = await mongodbHelpers.connect()
        if (allBidder.length > 0) {
            const highestBid = allBidder.reduce((maxBid, bid) => (bid.max_bid > maxBid ? bid.max_bid : maxBid), allBidder[0].max_bid)
            let highestBidder = allBidder.find((bid) => bid.max_bid === highestBid)
            highestBidder = JSON.parse(highestBidder)
            const currentBidderData = await this.getCurrentBidder(currentBidder, client)
            console.log('currentBidderData', currentBidderData)
            let maxBid
            if (currentBidderData && currentBidderData.max_bid !== undefined && currentBidderData.max_bid > currentBidder.bid_amount) {
                maxBid = currentBidder.max_bid
            } else {
                maxBid = currentBidder.bid_amount
            }
            if (highestBidder.max_bid > currentBidder.bid_amount && highestBidder.max_bid > maxBid) {
                highestBidder.max_bid = highestBidder.max_bid
                highestBidder.bid_status = 'Winning'
                highestBidder.bid_amount = highestBidder.max_bid > currentBidder.bid_amount ? await calculateNextAmont(currentBidder.bid_amount) : await calculateNextAmont(currentBidder.max_bid)
                highestBidder.next_bid_amount = highestBidder.bid_amount
                console.log('before save highest bidder', highestBidder)
                const updateHighestBidder = await this.saveOtherBidder(highestBidder, client)
                await mongodbHelper.updateOtherBidder(highestBidder)

                currentBidder.bid_status = 'Not Winning'
                currentBidder.next_bid_amount = highestBidder.next_bid_amount
                currentBidder.max_bid = currentBidder.bid_amount
                console.log('before current user save', currentBidder)
                const updateCurrentBidder = await this.saveCurrentBidder(currentBidder, client)
                await mongodbHelper.saveToMongoDB(currentBidder)
                // let getBidders = await this.getBidders(currentBidder.auction_id, currentBidder.buyer_id, highestBidder.buyer_id, client)
                // console.log('gett', getBidders)
                // getBidders = JSON.parse(getBidders)
                // const updateOtherBidder = await this.changeStatus(getBidders, { bid_status: 'Not Winning', next_bid_amount: highestBidder.next_bid_amount }, client)
                return highestBidder
            } if (highestBidder.max_bid < currentBidder.bid_amount && highestBidder.max_bid < maxBid) {
                console.log('else idf')
                highestBidder.bid_status = 'Not Winning'
                currentBidder.bid_status = 'Winning'
                currentBidder.max_bid = currentBidder.bid_amount
                currentBidder.bid_amount = await calculateNextAmont(highestBidder.max_bid)
                currentBidder.next_bid_amount = currentBidder.bid_amount
                highestBidder.next_bid_amount = currentBidder.next_bid_amount 
                console.log('before save highest bidder', highestBidder)
                console.log('before current user save', currentBidder)
                const updateHighestBidder = await this.saveOtherBidder(highestBidder, client)
                await mongodbHelper.updateOtherBidder(highestBidder)
                const updateCurrentBidder = await this.saveCurrentBidder(currentBidder, client)
                await mongodbHelper.saveToMongoDB(currentBidder)

                // let getBidders = await this.getBidders(currentBidder.auction_id, currentBidder.buyer_id, highestBidder.buyer_id, client)
                // getBidders = JSON.parse(getBidders)
                // const updateOtherBidder = await this.changeStatus(getBidders, { bid_status: 'Not Winning', next_bid_amount: currentBidder.next_bid_amount }, client)
                return currentBidder
            } 
        } else {
            console.log('current', currentBidder)
            // Only one bidder
            currentBidder.bid_status = 'Winning'
            currentBidder.max_bid = currentBidder.bid_amount > currentBidder.starting_bid ? currentBidder.bid_amount : currentBidder.bid_amount
            currentBidder.bid_amount = currentBidder.bid_amount > currentBidder.starting_bid ? await calculateNextAmont(currentBidder.starting_bid) : currentBidder.bid_amount
            currentBidder.next_bid_amount = currentBidder.bid_amount
            const saveData = await this.saveCurrentBidder(currentBidder, client)
            const saveMongoDB = await mongodbHelper.saveToMongoDB(currentBidder)
            return currentBidder
        }
        await connectionData.disconnect()
    },
}

module.exports.placeBid = async (socket, data, io, userData) => {
    try {
        const connectionData = await mongodbHelpers.connect()
        data.socket_id = socket.id
        const currentDate = new Date()
        const client = await redis.createClient({
            url: 'redis://dev-redis.68b9d9.ng.0001.euw2.cache.amazonaws.com:6379',
        }).on('error', (err) => console.log('Redis Client Error', err)).connect()
        // const client = await redis.createClient()
        if (!client.isOpen) {
            await client.connect()
        }
        const allBidders = await redisHelper.getOtherBidders(data.auction_id, data.buyer_id, client)
        const saveBidder = await redisHelper.saveBidder(data, client, allBidders)
        console.log('saving ouput', saveBidder)
        const saveBid = await historyHelper.saveBidHistory(data)
        const checkAuctionEnd = await mongodbHelpers.getAuction(data)
        console.log('checkAuctionEnd', checkAuctionEnd)
        const message = saveBidder
        // if (currentDate.getTime() === checkAuctionEnd.end_date.getTime()) {
        //     message = 'Congratulations you Won the Bid'
        // }
        // const updateTopBidder = await mongodbHelpers.updateTopBidder(saveBidder)
        io.to(data.lot_id).emit('placeBid', {
            success: true, message,
        })
        await connectionData.disconnect()
    } catch (err) {
        console.error(err)
    }
}
