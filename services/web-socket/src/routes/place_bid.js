// This code calculates the next bid amount based on a given value and checks if it is between 1 or 2. It also includes various functions to determine the first digit of the current bid, checking its increment
/* eslint-disable radix */
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

const webpush = require('web-push')
const redis = require('redis')

const { ObjectId } = require('mongodb')
const mongodbHelpers = require('../utilities/mongodb_helper')
const { listBidHistory } = require('./bid_history')
const { checkExtensionType, extensionAlert } = require('./update_extension')
const helper = require('../utilities/stop_step_function')
const Auction = require('../models/Auction')
const Buyer = require('../models/Buyer')
const Lot = require('../models/Lot')
const BidHistory = require('../models/BidHistory')

/**
 * Calculates the next bid amount based on the current bid value.
 * The function considers the first digit of the bid and determines the next bid
 * with a specific increment, ensuring it aligns with bidding conventions.
 *
 * @param {number} currentBid - The current bid amount to calculate the next bid for.
 * @returns {number} The calculated next bid amount.
 */

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

/**
 * Utility object for interacting with Redis in the context of lot bidding.
 * Provides methods to retrieve bidder data, lot details, current bidders,
 * and perform updates based on different extension scenarios.
 */

const redisHelper = {
    async getLotData(redisKey, client) {
        const allBidders = await client.hGetAll(redisKey)
        // Filter out the current bidder and return an array
        return Object.values(allBidders || {}).filter((bidder) => {
            const parsedBidder = JSON.parse(bidder)
            return parsedBidder
        })
    },
    async getLotDeatils(rediskey, client, lotID) {
        const allBidders = await client.hGetAll('lot', rediskey)
        // Filter out the current bidder and return an array
        return Object.values(allBidders || {}).filter((bidder) => {
            const parsedBidder = JSON.parse(bidder)
            return parsedBidder._id === lotID
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
}

/**
 * Retrieves lot details from Redis based on the provided lot ID.
 * If the lot is not found in Redis, fetches the data from MongoDB,
 * updates Redis, and returns the lot details.
 *
 * @param {string} lot_id - The ID of the lot to retrieve.
 * @param {object} client - The Redis client for database interaction.
 * @returns {object} The lot details retrieved from Redis or MongoDB.
 */

async function getLotFromRedis(lot_id, client) {
    try {
        const redisKey = `lot:${lot_id}`
        const getLotDetails = await redisHelper.getLotDeatils(redisKey, client, lot_id)
        const get_lot = []
        for (let i = 0; i < getLotDetails.length; i++) {
            get_lot.push(JSON.parse(getLotDetails[i]))
        }
        // if lot is active, then store   history for current bid
        if (getLotDetails.length <= 0) {
            const getLotData = await mongodbHelpers.getLot(lot_id, Lot)
            const checkAuctionEnd = await mongodbHelpers.getAuction(getLotData[0], Auction)
            getLotData[0].add_buyer_fees = checkAuctionEnd[0].add_buyer_fees === undefined ? 0 : checkAuctionEnd[0].add_buyer_fees
            getLotData[0].percentage = checkAuctionEnd[0].percentage
            getLotData[0].fees = checkAuctionEnd[0].fees
            getLotData[0].extended_time = checkAuctionEnd[0].extension_time
            getLotData[0].extension_type = checkAuctionEnd[0].extension_type
            await client.hSet('lot', redisKey, JSON.stringify(getLotData[0]))
            get_lot[0] = getLotData[0]
        }
        return get_lot[0]
    } catch (err) {
        console.log(err)
        return err
    }
}


/**
 * Connects a socket to a bid room (lotID), retrieves lot details from Redis,
 * emits an event to inform the client about joining the bid room, and lists bid history.
 *
 * @param {object} socket - The socket instance representing the connected client.
 * @param {string} lotID - The ID of the lot representing the bid room to join.
 * @param {object} io - The socket.io instance for broadcasting events.
 * @returns {object} once the bid room is joined and bid history is listed.
 */

module.exports.joinBidRoom = async (socket, lotID, io) => {
    try {
        // const client = await redis.createClient()
        const client = await redis.createClient({
            url: 'redis://dev-redis.68b9d9.ng.0001.euw2.cache.amazonaws.com:6379',
        }).on('error', (err) => console.log('Redis Client Error', err)).connect()
        // Check if the Redis client is not open, then connect
        if (!client.isOpen) {
            await client.connect()
        }
        // Join the socket to the specified bid room (lotID)
        socket.join(lotID)
        // Retrieve lot details from Redis
        const lotDetails = await getLotFromRedis(lotID, client)

        // Emit an event to the client informing them that they have joined the bid room
        socket.emit('joinBidRoom', lotDetails)

        // Prepare data for listing bid history
        const data = {
            auction_id: lotDetails.auction_id,
            lot_id: lotID,
        }
        // List bid history for the user in the bid room
        await listBidHistory(socket, data, io)
    } catch (err) {
        console.log(err)
        return err
    }
}

/**
 * Handles the process of placing a bid, updating bid details in Redis,
 * determining bid status, emitting events to clients, and sending push notifications.
 *
 * @param {object} socket - The socket instance representing the connected client.
 * @param {object} data - Bid information including lot and auction details.
 * @param {object} io - The socket.io instance for broadcasting events.
 * @param {object} userData - User data associated with the bid.
 * @returns {object} once the bid is placed and relevant updates are made.
 */
module.exports.placeBid = async (socket, data, io, userData) => {
    try {
        // const client = await redis.createClient()
        const connection = await mongodbHelpers.connect()
        const redisKey = `lot:${data.lot_id}`
        const bidInformation = data
        const client = await redis.createClient({
            url: 'redis://dev-redis.68b9d9.ng.0001.euw2.cache.amazonaws.com:6379',
        }).on('error', (err) => console.log('Redis Client Error', err)).connect()

        if (!client.isOpen) {
            await client.connect()
        }
        const getLotHistoryDetails = await redisHelper.getLotData(`auction:${data.auction_id}#${data.lot_id}`, client)
        let currentLotDetails = await getLotFromRedis(data.lot_id, client)
        data.time_stamp = new Date().getTime()
        currentLotDetails.email_address = data.email_address
        await client.hSet(`auction:${data.auction_id}#${data.lot_id}`, data.buyer_id, JSON.stringify(data))
        const auctionEndTimeEpoch = currentLotDetails.end_date
        const currentTimeEpoch = Date.now()
        const timeLeft = auctionEndTimeEpoch - currentTimeEpoch
        if (timeLeft <= 60000 && timeLeft > 0) {
            console.log('The bid is within the last minute before the auction ends.')
            const auctionLots = await mongodbHelpers.getAuctionLots(data, Lot)
            // await redisHelper.findAndUpdate(auctionLots, currentLotDetails, client, io, socket)
            await checkExtensionType(data)
            await listBidHistory(socket, data, io)
            const payload = {
                auction_id: data.auction_id,
                seller_email: data.seller_email,
            }
            const checkAuctionEnd = await mongodbHelpers.getAuction(payload, Auction)
            const stopStateMachine = await helper.stopExecution(currentLotDetails, checkAuctionEnd[0], auctionLots, client, io, socket)
            currentLotDetails = await getLotFromRedis(data.lot_id, client)
        }
        if (getLotHistoryDetails.length <= 0) {
            currentLotDetails.max_bid = data.bid_amount
            currentLotDetails.bid_amount = await calculateNextAmont(currentLotDetails.starting_price)
            currentLotDetails.winning_user = data.buyer_id       
        }
        else if (getLotHistoryDetails.length === 1) {
            const all_bidders = []
            for (let i = 0; i < getLotHistoryDetails.length; i++) {
                all_bidders.push(JSON.parse(getLotHistoryDetails[i]))
            }
            if (data.buyer_id === all_bidders[0].buyer_id) {
                currentLotDetails.max_bid = data.bid_amount
                currentLotDetails.bid_amount = data.bid_amount > currentLotDetails.starting_price ? await calculateNextAmont(currentLotDetails.starting_price) : data.bid_amount
                currentLotDetails.winning_user = data.buyer_id
            } else {
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
                currentLotDetails.bid_amount = await calculateNextAmont(highestBidder.bid_amount)
                currentLotDetails.winning_user = highestBidder.buyer_id
            } else if (data.bid_amount > currentLotDetails.max_bid) {
                currentLotDetails.max_bid = data.bid_amount
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
        await client.hSet('lot', redisKey, JSON.stringify(currentLotDetails))
        io.to(data.lot_id).emit('placeBid', {
            success: true, currentLotDetails,
        })
        await listBidHistory(socket, data, io)
        webpush.setVapidDetails('mailto: <sandhyashri@7edge.com>', 'BA3rSGSik3c8-pT1tspVZdvESBJlPs8Jk9kJJbwAV618yVlZZtgDwV5VLVsfC06IJ2L9IpfPRSD-riXOHKUyyro', 'qE9SJ9dbfZxGdE3jAw0NVHhGrGAhkjTNluvGltiUhNQ')
        let query = {
            _id: new ObjectId(data.buyer_id),
            seller_email: data.seller_email,
        }
        const updateLot = await mongodbHelpers.updateLotDetails(currentLotDetails, Lot)
        const all_bidders = []
        for (let i = 0; i < getLotHistoryDetails.length; i++) {
            all_bidders.push(JSON.parse(getLotHistoryDetails[i]))
        }
        let message; let 
            bidStatus
        if (all_bidders.length <= 0) {
            const buyerInformation = await mongodbHelpers.getBuyer(query, Buyer)
            message = 'Congratulations! 🎉 You\'re the highest bidder! '
            bidStatus = 'Winning'
            const payload = JSON.stringify({ title: 'Bidding', body: message })
            const pushresponse = await webpush.sendNotification(buyerInformation[0].token, payload).catch(console.log)
        } else {
            query = {
                _id: { $in: all_bidders.map((obj) => new ObjectId(obj.buyer_id)) },
                seller_email: data.seller_email,
            }
            const buyerData = await mongodbHelpers.getBuyer(query, Buyer)
            for (let i = 0; i <= buyerData.length; i++) {
                if (currentLotDetails.winning_user !== buyerData[i].buyer_id) {
                    message = 'Oops! 😕 You\'ve been outbid. Bid higher now to stay in the game and secure your desired item!"'
                    bidStatus = 'UnderBidder'
                } else {
                    message = 'Congratulations! 🎉 You\'re the highest bidder! '
                    bidStatus = 'Winning'
                }
                const payload = JSON.stringify({ title: 'Bidding', body: message })
                await webpush.sendNotification(buyerData[0].token, payload).catch(console.log)
            }
        }
        bidStatus = 'Winning'
        if (currentLotDetails.winning_user !== data.buyer_id && currentLotDetails.winning_user !== data.buyer_id) {
            message = 'Oops! 😕 You\'ve been outbid. Bid higher now to stay in the game and secure your desired item!"'
            bidStatus = 'UnderBidder'
        }
        bidInformation.bid_status = bidStatus
        await mongodbHelpers.save(bidInformation, BidHistory)
        // const saveHistory = await mongodbHelpers.saveBidHistory(bidInformation, BidHistory)
        await connection.disconnect()
    } catch (err) {
        console.log(err)
        return err
    }
}
