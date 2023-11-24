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
const webpush = require('web-push')


const mongoose = require('mongoose')
const redis = require('redis')

const mongodbHelpers = require('../utilities/mongodb_helper')
const historyHelper = require('../utilities/save-bid-history')
const helper = require('../utilities/auto_bid')
const { checkExtensionType } = require('./update_extension')




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

const redisHelper = {
    async getLotData(redisKey, client) {
        const allBidders = await client.hGetAll(redisKey)
        console.log('all bidder', allBidders)
        // Filter out the current bidder and return an array
        return Object.values(allBidders || {}).filter((bidder) => {
            const parsedBidder = JSON.parse(bidder)
            return parsedBidder
        })
    },
    async getOtherBidders(auctionId, currentBidderId, client) {
        const allBidders = await client.hGetAll(`auction:${auctionId}`)
        console.log('all bidder', allBidders)
        // Filter out the current bidder and return an array
        return Object.values(allBidders || {}).filter((bidder) => {
            const parsedBidder = JSON.parse(bidder)
            return parsedBidder.buyer_id !== currentBidderId
        })
    },
    async getLotDeatils(rediskey, client) {
        const allBidders = await client.hGetAll(rediskey)
        console.log('all bidder', allBidders)
        // Filter out the current bidder and return an array
        return Object.values(allBidders || {}).filter((bidder) => {
            const parsedBidder = JSON.parse(bidder)
            return parsedBidder
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
        // const connectionData = await mongodbHelpers.connect()
        if (allBidder.length > 0) {
            console.log('all bidders', allBidder)
            const bidderObjects = allBidder.map(JSON.parse)
            // Filter bidders with the "Winning" bid_status
            const highestBidder = bidderObjects.find((bidder) => bidder.bid_status === 'Winning')
            console.log('hi', highestBidder)
            // const highestBid = allBidder.reduce((maxBid, bid) => (bid.max_bid > currentBidder.max_bid ? bid.max_bid : currentBidder.max_bid), allBidder[0].max_bid)
            // let highestBidder = allBidder.find((bid) => bid.max_bid === highestBid)
            // console.log('highesr', highestBidder, highestBid)
            // highestBidder = JSON.parse(highestBidder)
            const currentBidderData = await this.getCurrentBidder(currentBidder, client)
            console.log('currentBidderData', currentBidderData)
            let maxBid
            if (currentBidderData && currentBidderData.max_bid !== undefined && currentBidderData.max_bid > currentBidder.bid_amount) {
                maxBid = currentBidder.max_bid
            } else {
                maxBid = currentBidder.bid_amount
            }
            if (highestBidder !== undefined && highestBidder.max_bid > currentBidder.bid_amount && highestBidder.max_bid > maxBid) {
                highestBidder.max_bid = highestBidder.max_bid
                highestBidder.bid_status = 'Winning'
                highestBidder.bid_amount = highestBidder.max_bid > currentBidder.bid_amount ? await calculateNextAmont(currentBidder.bid_amount) : await calculateNextAmont(currentBidder.max_bid)
                highestBidder.next_bid_amount = highestBidder.bid_amount
                console.log('before save highest bidder', highestBidder)
                const updateHighestBidder = await this.saveOtherBidder(highestBidder, client)
                // await mongodbHelper.updateOtherBidder(highestBidder)

                currentBidder.bid_status = 'Not Winning'
                currentBidder.next_bid_amount = highestBidder.next_bid_amount
                currentBidder.max_bid = currentBidder.bid_amount
                console.log('before current user save', currentBidder)
                const updateCurrentBidder = await this.saveCurrentBidder(currentBidder, client)
                // await mongodbHelper.saveToMongoDB(currentBidder)
                // let getBidders = await this.getBidders(currentBidder.auction_id, currentBidder.buyer_id, highestBidder.buyer_id, client)
                // console.log('gett', getBidders)
                // getBidders = JSON.parse(getBidders)
                // const updateOtherBidder = await this.changeStatus(getBidders, { bid_status: 'Not Winning', next_bid_amount: highestBidder.next_bid_amount }, client)
                // const getBidders = await this.getOtherBidders(currentBidder.auction_id, currentBidder.buyer_id, client)
                // console.log('getttt', getBidders)
                // const all_bidders = []
                // for (let i = 0; i < getBidders.length; i++) {
                //     all_bidders.push(JSON.parse(getBidders[i]))
                // }
                // const updateOtherBidder = await this.changeStatus(all_bidders, { bid_status: 'Not Winning', next_bid_amount: currentBidder.next_bid_amount }, client)
                return highestBidder
            } if ((highestBidder === undefined) || highestBidder.max_bid < currentBidder.bid_amount && highestBidder.max_bid < maxBid) {
                console.log('else idf')
                let x
                if (highestBidder === undefined) {
                    currentBidder.max_bid = currentBidder.bid_amount
                    x = currentBidder.bid_amount
                } else {
                    currentBidder.max_bid = highestBidder.max_bid
                    x = highestBidder.max_bid 
                }
                // highestBidder.bid_status = 'Not Winning'
                currentBidder.bid_status = 'Winning'
                currentBidder.bid_amount = await calculateNextAmont(x)
                currentBidder.next_bid_amount = currentBidder.bid_amount
                // highestBidder.next_bid_amount = currentBidder.next_bid_amount 
                console.log('before save highest bidder', highestBidder)
                console.log('before current user save', currentBidder)
                // const updateHighestBidder = await this.saveOtherBidder(highestBidder, client)
                // await mongodbHelper.updateOtherBidder(highestBidder)
                const updateCurrentBidder = await this.saveCurrentBidder(currentBidder, client)
                // await mongodbHelper.saveToMongoDB(currentBidder)

                const getBidders = await this.getOtherBidders(currentBidder.auction_id, currentBidder.buyer_id, client)
                console.log('getttt', getBidders)
                const all_bidders = []
                for (let i = 0; i < getBidders.length; i++) {
                    all_bidders.push(JSON.parse(getBidders[i]))
                }

                const updateOtherBidder = await this.changeStatus(all_bidders, { bid_status: 'Not Winning', next_bid_amount: currentBidder.next_bid_amount }, client)
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
            // const saveMongoDB = await mongodbHelper.saveToMongoDB(currentBidder)
            return currentBidder
        }
        // await connectionData.disconnect()
    },
}

// module.exports.placeBid = async (socket, data, io, userData) => {
//     try {
//         // const connectionData = await mongodbHelpers.connect()
//         data.socket_id = socket.id
//         // const client = await redis.createClient({
//         //     url: 'redis://dev-redis.68b9d9.ng.0001.euw2.cache.amazonaws.com:6379',
//         // }).on('error', (err) => console.log('Redis Client Error', err)).connect()
//         const client = await redis.createClient()
//         if (!client.isOpen) {
//             await client.connect()
//         }
//         // const checkAuctionEnd = await mongodbHelpers.getAuction(data)
//         const currentDateTime = new Date()
//         const allBidders = await redisHelper.getOtherBidders(data.auction_id, data.buyer_id, client)
//         const saveBidder = await redisHelper.saveBidder(data, client, allBidders)
//         // if (checkAuctionEnd.end_date === new Date(currentDateTime.getTime())) {
//         //     saveBidder.auction_status = 'Ended'
//         // } else {
//         //     saveBidder.auction_status = 'Not Ended'
//         // }
//         const message = saveBidder
//         // await client.hSet(`lot:${data.lot_id}`, JSON.stringify(data))
//         // const saveBid = await historyHelper.saveBidHistory(data)
//         console.log('curre', currentDateTime)
//         // const oneMinuteAgo = new Date(currentDateTime.getTime() - 60000)
//         // console.log('nnd', oneMinuteAgo)
//         // if (checkAuctionEnd.end_date === oneMinuteAgo) {
//         //     const extension = await checkExtensionType(data)
//         // }
//         // const updateTopBidder = await mongodbHelpers.updateTopBidder(saveBidder)
//         io.to(data.lot_id).emit('placeBid', {
//             success: true, message,
//         })
//         // await connectionData.disconnect()
//     } catch (err) {
//         console.error(err)
//     }
// }


async function getLotFromRedis(lot_id, client) {
    try {
        const redisKey = `lot:${lot_id}`
        const getLotDetails = await redisHelper.getLotDeatils(redisKey, client)
        console.log('@@@',getLotDetails )
        const get_lot = []
        for (let i = 0; i < getLotDetails.length; i++) {
            get_lot.push(JSON.parse(getLotDetails[i]))
        }
        console.log('get', get_lot)
        // if lot is active, then store   history for current bid
        if (getLotDetails.length <= 0) {
            const getLotData = await mongodbHelpers.getLot(lot_id)
            console.log('getd234', getLotData)
            const checkAuctionEnd = await mongodbHelpers.getAuction(getLotData[0])
            console.log('chec', checkAuctionEnd)
            getLotData[0].start_date = checkAuctionEnd[0].start_date
            getLotData[0].end_date = checkAuctionEnd[0].end_date
            getLotData[0].status = checkAuctionEnd[0].status
            const saveLotDetails = await client.hSet(redisKey, redisKey, JSON.stringify(getLotData[0]))
            get_lot[0] = getLotData[0]
        }
        return get_lot[0]
    } catch (err) {
        return err
    }
}

module.exports.joinBidRoom = async (socket, lotID) => {
    console.log('enteringgg', 'heyyy', lotID)
    try {
        // const client = await redis.createClient()
        // if (!client.isOpen) {
        //     await client.connect()
        // }
        socket.join(lotID)
        // const lotDetails = await getLotFromRedis(lotID, client)
        // console.log('lot', lotDetails)
        // socket.emit('joinBidRoom', lotDetails)
    } catch (err) {
        return err
    }
}


module.exports.placeBid = async (socket, data, io, userData) => {
    try {
        // step1 : get current lot info from redis
        const client = await redis.createClient()
        if (!client.isOpen) {
            await client.connect()
        }
        const redisKey = `lot:${data.lot_id}`
        const getLotHistoryDetails = await redisHelper.getLotData(`auction:${data.auction_id}#${data.lot_id}`, client)
        console.log('999900000000', getLotHistoryDetails)
        data.time_stamp = new Date().getTime()
        const saveBidHistory = await client.hSet(`auction:${data.auction_id}#${data.lot_id}`, data.buyer_id, JSON.stringify(data))
        const currentLotDetails = await getLotFromRedis(data.lot_id, client)
        if (getLotHistoryDetails.length <= 0) {
            console.log('111')
            //  if  no, then max bid and currentbid and buyer id
            currentLotDetails.max_bid = data.bid_amount
            currentLotDetails.bid_amount = await calculateNextAmont(100) // (getLotData[0].starting_bid)
            currentLotDetails.winning_user = data.buyer_id       
        }
        // check if there are any bid exist
        else if (getLotHistoryDetails.length === 1) {
            console.log('222222')
            const all_bidders = []
            for (let i = 0; i < getLotHistoryDetails.length; i++) {
                all_bidders.push(JSON.parse(getLotHistoryDetails[i]))
            }
            if (data.buyer_id === all_bidders[0].buyer_id) {
                currentLotDetails.max_bid = data.bid_amount
            } else {
                console.log('22222 else', currentLotDetails)
                // const highestBidder = all_bidders.reduce((maxObj, obj) => ((obj.bid_amount > maxObj.bid_amount) ? obj : maxObj), all_bidders[0])
                // console.log('hbidde', highestBidder)
                if (data.bid_amount > currentLotDetails.max_bid) {
                    currentLotDetails.bid_amount = await calculateNextAmont(currentLotDetails.max_bid) 
                    currentLotDetails.max_bid = data.bid_amount
                    currentLotDetails.winning_user = data.buyer_id 
                } 
                else if (data.bid_amount === currentLotDetails.max_bid) {
                    console.log('@@@@@@@@@@@@@@')
                    currentLotDetails.max_bid = all_bidders[0].bid_amount
                    currentLotDetails.bid_amount = currentLotDetails[0].max_bid
                } else {
                    console.log('%%%%%%%%%%%%%%%%%%%%%%%')
                    currentLotDetails.bid_amount = await calculateNextAmont(data.bid_amount) 
                }
            } 
        } else {
            console.log('333333')
            const all_bidders = []
            for (let i = 0; i < getLotHistoryDetails.length; i++) {
                all_bidders.push(JSON.parse(getLotHistoryDetails[i]))
            }
            const highestBidder = all_bidders.reduce((maxObj, obj) => ((obj.bid_amount > maxObj.bid_amount) ? obj : maxObj), all_bidders[all_bidders.length - 1])
            console.log('111highestBidder', highestBidder)
            if (data.buyer_id === highestBidder.buyer_id) {
                currentLotDetails.max_bid = data.bid_amount
                // added later
                currentLotDetails.bid_amount = await calculateNextAmont(highestBidder.bid_amount)
            } else {
                console.log('4444444444444', currentLotDetails)
                if (data.bid_amount > currentLotDetails.max_bid) {
                    console.log('if')
                    currentLotDetails.bid_amount = await calculateNextAmont(currentLotDetails.max_bid) 
                    currentLotDetails.max_bid = data.bid_amount
                    currentLotDetails.winning_user = data.buyer_id 
                } else {
                    console.log('else data', highestBidder)
                    if (data.bid_amount === currentLotDetails.max_bid) {
                        console.log('@@@@@@@@@@@@@@')
                        currentLotDetails.winning_user = highestBidder.buyer_id
                        currentLotDetails.bid_amount = highestBidder.bid_amount
                    } else {
                        currentLotDetails.bid_amount = await calculateNextAmont(data.bid_amount) 
                    }
                }
            } 
        }
        const saveLotDetails = await client.hSet(redisKey, redisKey, JSON.stringify(currentLotDetails))
        console.log('currentLotDetails', currentLotDetails, data.lot_id)
        io.to(data.lot_id).emit('placeBid', {
            success: true, currentLotDetails,
        })
       
        // const saveBidHistory = await client.hSet(`lot:${data.lot_id}`, data.buyer_id, JSON.stringify(data))


        // const auction
        // lotData.max_bid = data.bid_amount > lotData.starting_bid ?  data.bid_amount 
            

        // const x = await client.hSet(redisKey, data.buyer_id, JSON.stringify(lotData))
        // console.log('xxxx', x)
        // } else {
        //     max_bid = 
        // }
    } catch (err) {
        return err
    }
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
}

// extension steps
// update redis cache of lot by adding the extension time
// emit the updated lot data to  lot room
