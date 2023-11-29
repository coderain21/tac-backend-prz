/* eslint-disable no-underscore-dangle */
/* eslint-disable no-prototype-builtins */
/* eslint-disable no-plusplus */
/* eslint-disable brace-style */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-lonely-if */
/* eslint-disable camelcase */
/* eslint-disable no-multi-assign */
/* eslint-disable no-unused-expressions */
/* eslint-disable no-nested-ternary */
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
const { readSync } = require('fs')
const { Console } = require('console')
const webpush = require('web-push')


const mongoose = require('mongoose')
const redis = require('redis')

const mongodbHelpers = require('../utilities/mongodb_helper')
const historyHelper = require('../utilities/save-bid-history')
const helper = require('../utilities/auto_bid')
const { addToCart } = require('../utilities/add-to-cart')
const { listBidHistory } = require('./bid_history')
const { checkExtensionType } = require('./update_extension')
// const {sendPinpointEmail} = require('../utilities/send_email')



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
    const firstDigit = Math.floor(currentBid / 10 ** (Math.floor(Math.log10(currentBid))))
    let nextBid

    if (firstDigit === 1 || firstDigit === 2 || (firstDigit >= 5 && firstDigit <= 9)) {
        const baseIncrement = (firstDigit === 1) ? 10 : (firstDigit === 2) ? 20 : 50
        const remainder = currentBid % 10

        if (remainder < 2) {
            nextBid = currentBid + (baseIncrement - remainder)
        } else if (remainder < 5) {
            nextBid = currentBid + (5 - remainder)
        } else if (remainder < 8) {
            nextBid = currentBid + (8 - remainder)
        } else {
            nextBid = currentBid + (10 - remainder)
        }
    } else if (firstDigit === 3 || firstDigit === 4) {
        let increment
        let lastDigit
        currentBid = currentBid.toString()
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
        } else {
            const roundedBid = 10 ** (currentBid.length - 1)
            nextBid = Math.ceil(parseInt(currentBid, 10) / roundedBid) * roundedBid     
        }  
    } else {
        nextBid = currentBid + 1
    }
    
    return parseInt(nextBid, 10)
}

// const mongodbHelper = {
//     async saveToMongoDB(bidderInfo) {
//         await BidInformation.findOneAndUpdate(
//             { auction_id: bidderInfo.auction_id, buyer_id: bidderInfo.buyer_id },
//             { $set: bidderInfo },
//             { upsert: true, new: true },
//         )
//     },
//     async updateOtherBidder(bidder) {
//         // Create or update MongoDB document
//         await BidInformation.findOneAndUpdate(
//             { auction_id: bidder.auction_id, buyer_id: bidder.buyer_id },
//             { $set: bidder },
//             { upsert: true, new: true },
//         )
//     },
// }

function parseExtensionTime(extensionTimeString) {
    const regex = /^(\d+)\s*(\w*)$/
    const match = extensionTimeString.match(regex)

    if (!match) {
        throw new Error('Invalid extension time format')
    }

    const amount = parseInt(match[1], 10)
    const unit = (match[2] || 'minute').toLowerCase() // Default to minute if unit is not provided

    const millisecondsInUnit = {
        millisecond: 1,
        second: 1000,
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
    }

    if (!millisecondsInUnit.hasOwnProperty(unit)) {
        throw new Error('Invalid time unit')
    }

    return amount * millisecondsInUnit[unit]
}

const redisHelper = {
    async getLotData(redisKey, client) {
        const allBidders = await client.hGetAll(redisKey)
        // Filter out the current bidder and return an array
        return Object.values(allBidders || {}).filter((bidder) => {
            const parsedBidder = JSON.parse(bidder)
            return parsedBidder
        })
    },
    async getLotDeatils(rediskey, client) {
        const allBidders = await client.hGetAll(rediskey)
        // Filter out the current bidder and return an array
        return Object.values(allBidders || {}).filter((bidder) => {
            const parsedBidder = JSON.parse(bidder)
            return parsedBidder
        })
    },
    async  getCurrentBidder(bidderData, client) {
        try {
            const allBidders = await client.hGetAll(`auction:${bidderData.auction_id}`)    
            // Parse each string value into an object
            const parsedBidders = Object.values(allBidders || {}).map((bidder) => JSON.parse(bidder))
            const x = parsedBidders.find((parsedBidder) => parsedBidder.buyer_id === bidderData.buyer_id)
            if (x === undefined) {
                return false
            }
            // Find the current bidder by buyer_id
            return parsedBidders.find((parsedBidder) => parsedBidder.buyer_id === bidderData.buyer_id)
        } catch (err) {
            return {}
        }
    },
    async findAndUpdate(lots, currentLotDetails, client, io, socket) {
        const updates = {}
        const extensionTimeInMilliseconds = parseExtensionTime(currentLotDetails.extended_time)
        if (currentLotDetails.extension_type === 'All Lots') {
            for (const record of lots) {
                const bidKey = `lot:${record._id}`
                updates[bidKey] = { end_date: currentLotDetails.end_date + extensionTimeInMilliseconds }
                const newRecord = {
                    ...record,
                    bidKey: currentLotDetails.end_date + extensionTimeInMilliseconds,
                }
                await client.hSet(bidKey, bidKey, JSON.stringify(newRecord))
                console.log('emitting extension before', record._id)
                // io.to(record._id).emit('extensionAlert', {
                //     success: true, extension: { extended: true, extended_time: extensionTimeInMilliseconds },
                // })
                // socket.join(record._id)
                // socket.emit('extensionAlert', {success: true, extension: { extended: true, extended_time: extensionTimeInMilliseconds }})
                io.to(record._id).emit('extensionAlert', {
                    success: true, extension: { extended: true, extended_time: extensionTimeInMilliseconds },
                })

                console.log('emitting extension after')
            }
        } else if (currentLotDetails.extension_type === 'Individual') {
            const bidKey = `lot:${currentLotDetails.lot_id}`
            currentLotDetails.end_date += extensionTimeInMilliseconds
            const saveLotDetails = await client.hSet(bidKey, bidKey, JSON.stringify(currentLotDetails))
            io.to(currentLotDetails.lot_id).emit('extensionAlert', {
                success: true, extension: { extended: true, extended_time: extensionTimeInMilliseconds },
            })
        } else {
            let previousExtensionTime = 0
            for (const record of lots) {
                const updatedExtensionTime = previousExtensionTime + extensionTimeInMilliseconds
                previousExtensionTime = updatedExtensionTime
                const bidKey = `lot:${record.lot_id}`
                updates[bidKey] = { end_date: currentLotDetails.end_date + updatedExtensionTime }
                const newRecord = {
                    ...record,
                    bidKey: currentLotDetails.end_date + updatedExtensionTime,
                }
                await client.hSet(bidKey, bidKey, JSON.stringify(newRecord))
                io.to(record._id).emit('extensionAlert', {
                    success: true, extension: { extended: true, extended_time: updatedExtensionTime },
                })
            }
        }
    },

}

async function getLotFromRedis(lot_id, client) {
    try {
        const redisKey = `lot:${lot_id}`
        const getLotDetails = await redisHelper.getLotDeatils(redisKey, client)
        const get_lot = []
        for (let i = 0; i < getLotDetails.length; i++) {
            get_lot.push(JSON.parse(getLotDetails[i]))
        }
        // if lot is active, then store   history for current bid
        if (getLotDetails.length <= 0) {
            const connectionData = await mongodbHelpers.connect()
            const getLotData = await mongodbHelpers.getLot(lot_id)
            const checkAuctionEnd = await mongodbHelpers.getAuction(getLotData[0])
            getLotData[0].status = checkAuctionEnd[0].status === undefined ? '' : checkAuctionEnd[0].status
            getLotData[0].add_buyer_fees = checkAuctionEnd[0].add_buyer_fees
            getLotData[0].percentage = checkAuctionEnd[0].percentage
            getLotData[0].fees = checkAuctionEnd[0].fees
            getLotData[0].extended_time = checkAuctionEnd[0].extension_time
            getLotData[0].extension_type = checkAuctionEnd[0].extension_type
            const saveLotDetails = await client.hSet(redisKey, redisKey, JSON.stringify(getLotData[0]))
            get_lot[0] = getLotData[0]
            await connectionData.disconnect()
        }
        return get_lot[0]
    } catch (err) {
        console.log(err)
        return err
    }
}

module.exports.joinBidRoom = async (socket, lotID, io) => {
    try {
        const client = await redis.createClient()
        // const client = await redis.createClient({
        //     url: 'redis://dev-redis.68b9d9.ng.0001.euw2.cache.amazonaws.com:6379',
        // }).on('error', (err) => console.log('Redis Client Error', err)).connect()
        if (!client.isOpen) {
            await client.connect()
        }
        socket.join(lotID)
        const lotDetails = await getLotFromRedis(lotID, client)
        socket.emit('joinBidRoom', lotDetails)
        const data = {
            auction_id: lotDetails.auction_id,
            lot_id: lotID,
        }
        const listHistory = await listBidHistory(socket, data, io)
    } catch (err) {
        console.log(err)
        return err
    }
}


module.exports.placeBid = async (socket, data, io, userData) => {
    console.log('placing bid')
    try {
        // step1 : get current lot info from redis
        const client = await redis.createClient()
        const redisKey = `lot:${data.lot_id}`
        let extended = false
        let extension_time = 0
        let extension_type = ''
        // const client = await redis.createClient({
        //     url: 'redis://dev-redis.68b9d9.ng.0001.euw2.cache.amazonaws.com:6379',
        // }).on('error', (err) => console.log('Redis Client Error', err)).connect()

        if (!client.isOpen) {
            await client.connect()
        }
        const getLotHistoryDetails = await redisHelper.getLotData(`auction:${data.auction_id}#${data.lot_id}`, client)
        data.time_stamp = new Date().getTime()
        const saveBidHistory = await client.hSet(`auction:${data.auction_id}#${data.lot_id}`, data.buyer_id, JSON.stringify(data))
        const currentLotDetails = await getLotFromRedis(data.lot_id, client)
        // static values
        const currentTimestamp = new Date().getTime()
        console.log('currentTimestamp', currentTimestamp, currentLotDetails.end_date)
        // if (currentLotDetails.end_date === currentTimestamp || currentLotDetails.end_date < currentTimestamp) {
        //     console.log('insidee 123')
        //     const all_bidders = []
        //     for (let i = 0; i < getLotHistoryDetails.length; i++) {
        //         all_bidders.push(JSON.parse(getLotHistoryDetails[i]))
        //     }
        //     const highestBidder = all_bidders.reduce((maxObj, obj) => ((obj.bid_amount > maxObj.bid_amount) ? obj : maxObj), all_bidders[all_bidders.length - 1])

        //     if (data.bid_amount > currentLotDetails.max_bid) {
        //         console.log('if')
        //         currentLotDetails.bid_amount = data.bid_amount 
        //         currentLotDetails.max_bid = data.bid_amount
        //         currentLotDetails.winning_user = data.buyer_id 
        //     } else if (data.bid_amount < currentLotDetails.max_bid) {
        //         console.log('else data')
        //         currentLotDetails.winning_user = currentLotDetails.winning_user
        //         currentLotDetails.bid_amount = currentLotDetails.bid_amount
        //         currentLotDetails.max_bid = currentLotDetails.max_bid
        //     }
        //     currentLotDetails.lot_status = 'Ended'
        //     currentLotDetails.email_address = currentLotDetails.winning_user
        //     const saveToCart = await addToCart(currentLotDetails)
        //     console.log('endedddd')
        //     io.to(data.lot_id).emit('placeBid', {
        //         success: true, winning_user: currentLotDetails.winning_user,
        //     })
        //     return
        // }
        const now = new Date()
        const oneMinuteAgo = new Date(now - 60000) // Subtract 1 minute (60,000 milliseconds)
        
        const oneMinuteBeforeEndDate = oneMinuteAgo.getTime()
        const auctionEndTimeEpoch = currentLotDetails.end_date // Example end time: January 1, 2023, at 18:00 (6:00 PM) in epoch timestamp

        // Get current time in epoch timestamp (in seconds)
        const currentTimeEpoch = Date.now()

        // Calculate time left until auction end in seconds
        const timeLeft = auctionEndTimeEpoch - currentTimeEpoch

        // if (timeLeft <= 60000 && timeLeft > 0) {
        if (timeLeft) {
            console.log('The bid is within the last minute before the auction ends.')
            extension_time = currentLotDetails.extended_time
            extension_type = currentLotDetails.extension_type
            extended = true
            const auctionLots = await mongodbHelpers.getAuctionLots(data)
            const updateExtension = await redisHelper.findAndUpdate(auctionLots, currentLotDetails, client, io, socket)
            await checkExtensionType(data)
        }
        if (getLotHistoryDetails.length <= 0) {
            //  if  no, then max bid and currentbid and buyer id
            currentLotDetails.max_bid = data.bid_amount
            currentLotDetails.bid_amount = await calculateNextAmont(100) // (getLotData[0].starting_bid)
            currentLotDetails.winning_user = data.buyer_id       
        }
        // check if there are any bid exist
        else if (getLotHistoryDetails.length === 1) {
            const all_bidders = []
            for (let i = 0; i < getLotHistoryDetails.length; i++) {
                all_bidders.push(JSON.parse(getLotHistoryDetails[i]))
            }
            if (data.buyer_id === all_bidders[0].buyer_id) {
                currentLotDetails.max_bid = data.bid_amount
            } else {
                // const highestBidder = all_bidders.reduce((maxObj, obj) => ((obj.bid_amount > maxObj.bid_amount) ? obj : maxObj), all_bidders[0])
                // console.log('hbidde', highestBidder)
                if (data.bid_amount > currentLotDetails.max_bid) {
                    currentLotDetails.bid_amount = await calculateNextAmont(currentLotDetails.max_bid) 
                    currentLotDetails.max_bid = data.bid_amount
                    currentLotDetails.winning_user = data.buyer_id 
                } 
                else if (data.bid_amount === currentLotDetails.max_bid) {
                    currentLotDetails.max_bid = all_bidders[0].bid_amount
                    currentLotDetails.bid_amount = currentLotDetails[0].max_bid
                } else {
                    currentLotDetails.bid_amount = await calculateNextAmont(data.bid_amount) 
                }
            } 
        } else {
            const all_bidders = []
            for (let i = 0; i < getLotHistoryDetails.length; i++) {
                all_bidders.push(JSON.parse(getLotHistoryDetails[i]))
            }
            const highestBidder = all_bidders.reduce((maxObj, obj) => ((obj.bid_amount > maxObj.bid_amount) ? obj : maxObj), all_bidders[all_bidders.length - 1])
            if (data.buyer_id === highestBidder.buyer_id) {
                currentLotDetails.max_bid = data.bid_amount
                // added later
                currentLotDetails.bid_amount = await calculateNextAmont(highestBidder.bid_amount)
            } else if (data.bid_amount > currentLotDetails.max_bid) {
                currentLotDetails.max_bid = data.bid_amount
                // added later
                currentLotDetails.bid_amount = await calculateNextAmont(highestBidder.bid_amount)
                currentLotDetails.winning_user = data.buyer_id
            } else {
                if (data.bid_amount > currentLotDetails.max_bid) {
                    currentLotDetails.bid_amount = await calculateNextAmont(currentLotDetails.max_bid) 
                    currentLotDetails.max_bid = data.bid_amount
                    currentLotDetails.winning_user = data.buyer_id 
                } else {
                    if (data.bid_amount === currentLotDetails.max_bid) {
                        currentLotDetails.winning_user = highestBidder.buyer_id
                        currentLotDetails.bid_amount = highestBidder.bid_amount
                    } else {
                        currentLotDetails.bid_amount = await calculateNextAmont(data.bid_amount) 
                    }
                }
            } 
        }
        const saveLotDetails = await client.hSet(redisKey, redisKey, JSON.stringify(currentLotDetails))
        console.log('currentLotDetails', currentLotDetails)
        io.to(data.lot_id).emit('placeBid', {
            success: true, currentLotDetails,
        })
        console.log('afterrrr')
        // webpush.setVapidDetails('mailto: <sandhyashri@7edge.com>', 'BA3rSGSik3c8-pT1tspVZdvESBJlPs8Jk9kJJbwAV618yVlZZtgDwV5VLVsfC06IJ2L9IpfPRSD-riXOHKUyyro', 'qE9SJ9dbfZxGdE3jAw0NVHhGrGAhkjTNluvGltiUhNQ')
        // const getBuyerToken = await mongodbHelpers.getBuyer(data.buyer_id)
        // let message = 'Congratulations! 🎉 You\'re the highest bidder! '
        // if (currentLotDetails.winning_user !== data.buyer_id) {
        //     message = 'Oops! 😕 You\'ve been outbid on [item name]. Bid higher now to stay in the game and secure your desired item!"'
        // }
        // const payload = JSON.stringify({ title: 'Bidding', body: message })
        // const pushresponse = await webpush.sendNotification(getBuyerToken[0].token, payload).catch(console.log)
        // console.log('res', pushresponse)
    } catch (err) {
        console.log(err)
        return err
    }
}

// extension steps
// update redis cache of lot by adding the extension time
// emit the updated lot data to  lot room
// step1 : get current lot info from redis ------
// step2: check for lot status = complete/ornot
// if lot is active, then store   history for current bid
// check if there are any bid exist
//  if  no, then max bid and currentbid and buyer id
// if yes,  if only one history, then current bid amount is greater than max_bid then store current bid amount =  new bid amount and max_bid = new_bid_amount
// if yes, if only one history,then current bid amount is less than max_bid dont do anything
// if more than one history get the greatest max_bid from redis $200
// if there are more unique bidders, then current bid amount is greater than max_bid then store current bid amount = nextIncrement(max_bid) old max_bidder and max_bid = new_bid_amount
// if i get mx bid of more than one  users  on the same timestamp then we will be considering 1st registered bidder and concurrent_user = [other bidders]
