/* eslint-disable consistent-return */
/* eslint-disable no-undef */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-console */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-plusplus */
/* eslint-disable no-param-reassign */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-restricted-syntax */
/* eslint-disable camelcase */
/* eslint-disable array-callback-return */
/* eslint-disable no-await-in-loop */

const {
    PinpointEmail,
} = require('aws-sdk')
const { ObjectId } = require('mongodb')
const Auction = require('../entities/Auction')
const mongodbHelper = require('../lib/mongodb_helper')
const redisHelper = require('../lib/redis_helper')
const BidInformation = require('../entities/BidInformation')
// const Bid = require('../entities/Bid')
const Users = require('../entities/Users')
const Buyers = require('../entities/Buyers')
const Lot = require('../entities/Lot')

const pinpoint = new PinpointEmail()
let connection = null

/**
 * Gets all the bidders for a given redis key, and filters them to only include
 * bidders that match the auction data passed in
 *
 * @param {string} rediskey The redis key to fetch bidders from
 * @param {object} client The redis client to use
 * @param {object} auctionData The auction data to match bidders against
 * @returns {Promise<array>} An array of bidders that match the auction data
 */
async function getLot(rediskey, client, auctionData) {
    const allBidders = await client.hgetall(rediskey)
    /*
     * Filter the bidders to only include those that match the auction data
     *
     * First, we get all the bidders for the given redis key.
     * Next, we parse each bidder into an object (as JSON)
     * Then, we filter the array of bidders based on whether the seller_email and auction_id match what was passed in
     */
    return Object.values(allBidders || {}).filter((bidder) => {
        const parsedBidder = JSON.parse(bidder)
        return parsedBidder.seller_email === auctionData.seller_email && parsedBidder.auction_id === auctionData.auction_id
    })
}

async function lotDetails(rediskey, client) {
    try {
        const existingRecord = await client.hget('lot', rediskey)
        // If the lot was found in Redis, return it as a single-element array
        if (existingRecord) {
            return [existingRecord]
        }
        // If the lot was not found in Redis, return an empty array
        return []
    } catch (err) {
        // Log any errors which occur
        console.log(err)
        // Return an empty array
        return []
    }
}

/**
 * Formats a currency string
 * @param {number|string} amount The amount to format
 * @param {string} currencyCode The currency code to use (e.g. 'USD')
 * @returns {string} The formatted currency string
 */
function formatCurrency(amount, currencyCode) {
    try {
        // Convert amount to a string
        const amountString = String(amount)

        // Remove currency symbol and commas
        const cleanedAmount = amountString.replace(/[^\d.]/g, '')

        const parsedAmount = parseFloat(cleanedAmount)

        // Return an error string if the amount is not a valid number
        if (isNaN(parsedAmount)) {
            console.error(`Invalid amount: ${amountString}`)
            return 'Invalid amount'
        }

        // Include commas and currency symbol in the formatted result
        const formattedAmount = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 2, // Adjust as needed
            maximumFractionDigits: 2, // Adjust as needed
        }).format(parsedAmount)

        return formattedAmount
    } catch (err) {
        console.error(err)
        return 'Error formatting currency'
    }
}

/**
 * Send an email using the AWS Pinpoint service
 *
 * @param {string} destinationId The email address to send the email to
 * @param {string} sourceId The email address the email is from
 * @param {string} templateData The data to pass to the email template
 * @param {string} templateArn The ARN of the email template to use
 */
async function sendMail(destinationId, sourceId, templateData, templateArn) {
    const params = {
        // The content of the email
        Content: {
            // The template to use
            Template: {
                // The ARN of the email template to use
                TemplateArn: templateArn,
                // The data to pass to the email template
                TemplateData: templateData,
            },
        },
        // The email address the email is from
        FromEmailAddress: process.env.SENDER_EMAIL,
        // The email address to send the email to
        Destination: {
            // An array of email addresses to send the email to
            ToAddresses: [destinationId],
        },
    }
    try {
        // Send the email using the AWS Pinpoint service
        const sendEmail = await pinpoint.sendEmail(params).promise()
        console.log('sendEmail', sendEmail)
    } catch (error) {
        // Log any errors that occur
        console.error('Failed to send email:', error)
    }
}

/**
 * Handle the AWS SQS trigger event for the auction completion job
 *
 * This function retrieves the bidders from MongoDB, retrieves the lots from Redis, and sends an email to each buyer
 * using the AWS Pinpoint service. The function updates the auction status to 'Completed' in MongoDB after all emails have been sent.
 *
 * @param {object} event - The event object from the AWS SQS trigger
 * @returns {Promise<void>}
 */
module.exports.sqsTriggerFunction = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            connection = await mongodbHelper.connect()
        }

        // Retrieve the bidders from MongoDB
        const getBidders = await mongodbHelper.getBidders(event, BidInformation)

        // Connect to Redis and retrieve the auction lots
        const client = await redisHelper.createRedisClient()

        // Initialize empty array to store promiseList
        const promiseList = []
        const auctionData = await mongodbHelper.getAuction(event, Auction)
        const payload = {
            seller_email: auctionData.seller_email,
            auction_id: auctionData.auction_id,
        }
        const getAuctionLots = await mongodbHelper.getAuctionLots(payload, Lot)
        console.log('getAuctionLots', getAuctionLots)
        const lastRecord = getAuctionLots[getAuctionLots.length - 1]
        console.log(lastRecord)
        // Update the auction status to 'Completed' in MongoDB
        await mongodbHelper.update(Auction, auctionData._id, { status: 'Completed' })
        const getAllLots = await getLot('lot', client, event)
        const get_lot = getAllLots.map((item) => JSON.parse(item))
        // const lastLot = get_lot[get_lot.length - 1]
        if (getBidders.length > 0) {
        // Loop through bidders
            for (const user of getBidders) {
            // Retrieve the auction lots for each bidder
                // Reset lists for each bidder
                const winningLot = []
                const notWinning = []

                // Retrieve the auction data from MongoDB

                // Set up a MongoDB query to find the seller's information
                const sellerQuery = {
                    email_address: event.seller_email,
                }
                const sellerInformation = await mongodbHelper.getUser(sellerQuery, Users)

                // Set up a MongoDB query to find the user's information
                const query = {
                    _id: new ObjectId(user.buyer_id),
                }
                const buyerInformation = await mongodbHelper.getUser(query, Buyers)

                // Loop through the lots and add them to the winning or losing lists
                for (const lot of get_lot) {
                    const rediskey = `lot:${lot._id}`
                    const getLotInfo = await lotDetails(rediskey, client)
                    const singleLot = []
                    for (let i = 0; i < getLotInfo.length; i++) {
                        singleLot.push(JSON.parse(getLotInfo[i]))
                    }
                    // Add the CDN link to the image URL
                    lot.lot_image = `${process.env.CDN_LINK}${lot.images[0].url}`

                    // Add the formatted bid amount to the lot
                    if (lot.winning_user === user.buyer_id) {
                        event.lot_number = lot.lot_number
                        event.email_address = user.email_address
                        // const getAmount = await mongodbHelper.getBidAmount(event, BidInformation)
                        // console.log('won', getAmount)
                        lot.bid_amount = formatCurrency(singleLot[0].bid_amount, auctionData.currency)
                        winningLot.push(lot)
                    } else {
                        event.lot_number = lot.lot_number
                        event.email_address = user.email_address
                        const getAmount = await mongodbHelper.getBidAmount(event, BidInformation)
                        if (getAmount !== null) {
                            console.log('not null')
                            lot.bid_amount = formatCurrency(getAmount.bid_amount, auctionData.currency)
                            notWinning.push(lot)
                        }
                    }
                }
                // If the user didn't win any lots, change the email subject
                const subjectDescription = winningLot.length > 0 ? 'You Won the Auction' : 'You lost the Auction'
                const paymentContent = winningLot.length > 0 ? 'A payment request email will follow shortly along with instructions on the next steps.' : ''

                // Create the email data
                const template_data = {
                    winning_lot: winningLot.sort((a, b) => a.lot_number - b.lot_number),
                    winning_lot_count: winningLot.length,
                    buyer: buyerInformation[0].first_name === '' ? 'Customer' : `${buyerInformation[0].first_name} ${buyerInformation[0].last_name}`,
                    title: auctionData.title,
                    logo_url: auctionData.logo_image === '' ? `${process.env.S3_BUCKET_URL}Logo.png` : `${process.env.S3_BUCKET_URL}${auctionData.logo_image}`,
                    not_winning_lot: notWinning.sort((a, b) => a.lot_number - b.lot_number),
                    not_winning_lot_count: notWinning.length,
                    seller_name: sellerInformation[0].first_name === '' ? 'User' : `${sellerInformation[0].first_name} ${sellerInformation[0].last_name}`,
                    seller_email: auctionData.seller_email,
                    subject: subjectDescription,
                    paymentContent,
                }

                // Send email
                promiseList.push(sendMail(user.email_address, process.env.SENDER_EMAIL_ADDRESS, JSON.stringify(template_data), process.env.TEMPLATE_ARN_AUCTION_COMPLETION))
            }

            // Run all the promises in parallel
            await Promise.all(promiseList)
        }
        // clear the cache
        // if (lastLot.lot_number === event.lot_number) {
        //     for (const lot of get_lot) {
        //         const redisKeys = `lot:${lot._id}`
        //         const clearingCacheLot = await client.hset('lot', redisKeys, JSON.stringify({}))
        //         const clearingCacheLotHistory = await client.del(`lot-history:${lot._id}`)
        //         const clearAuctionHistory = await client.del(`auction:${auctionData.auction_id}#${lot._id}`)
        //         console.log('clearingCache', clearAuctionHistory, clearingCacheLotHistory, clearingCacheLot)
        //     }
        // }
        return true
    } catch (err) {
        console.log('err', err)
        return err
    }
}
