/* eslint-disable no-shadow */
/* eslint-disable prefer-regex-literals */
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

// const {
//     PinpointEmail,
// } = require('aws-sdk')
const { ObjectId } = require('mongodb')
const Auction = require('../entities/Auction')
const mongodbHelper = require('../lib/mongodb_helper')
const redisHelper = require('../lib/redis_helper')
const BidInformation = require('../entities/BidInformation')
// const Bid = require('../entities/Bid')
const Users = require('../entities/Users')
const Buyers = require('../entities/Buyers')
const SubDomain = require('../entities/SubDomain')
const Counter = require('../entities/Counter')
const Lot = require('../entities/Lot')
const { sendTemplateEmails } = require('../lib/mailchimp_helper')

// const pinpoint = new PinpointEmail()
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
            // amazonq-ignore-next-line
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
// async function sendMail(destinationId, sourceId, templateData, templateArn) {
//     const params = {
//         // The content of the email
//         Content: {
//             // The template to use
//             Template: {
//                 // The ARN of the email template to use
//                 TemplateArn: templateArn,
//                 // The data to pass to the email template
//                 TemplateData: templateData,
//             },
//         },
//         // The email address the email is from
//         FromEmailAddress: process.env.SENDER_EMAIL,
//         // The email address to send the email to
//         Destination: {
//             // An array of email addresses to send the email to
//             ToAddresses: [destinationId],
//         },
//     }
//     try {
//         // Send the email using the AWS Pinpoint service
//         const sendEmail = await pinpoint.sendEmail(params).promise()
//         console.log('sendEmail', sendEmail)
//     } catch (error) {
//         // Log any errors that occur
//         console.error('Failed to send email:', error)
//     }
// }

/**
 * Generates an order code with prefix "OD" and padded zeros
 * @param {number} number The order number to format
 * @returns {string} The formatted order code
 */
function generateOrderCode(number) {
    return `OD${String(number).padStart(6, '0')}`
}

/**
 * Generates an order code with prefix "OD" and padded zeros
 * @param {number} number The order number to format
 * @returns {string} The formatted order code
 */
// const getNextOrderSequence = async (auctionId, sellerEmail) => {
//     try {
//         console.log('Order Sequence Query:', {
//             auction_id: auctionId.toString(), // Ensure String type
//             seller_email: sellerEmail,
//             record_type: 'Orders',
//         })

//         const result = await mongodbHelper.updateUsingMongoDB(
//             process.env.MONGO_CLIENT,
//             process.env.DATABASE,
//             process.env.COUNTER_LOT,
//             {
//                 auction_id: auctionId.toString(), // 🔥 Ensuring type consistency
//                 seller_email: { $regex: new RegExp(`^${sellerEmail}$`, 'i') }, // Case-insensitive match
//                 record_type: 'Orders',
//             },
//             {
//                 $setOnInsert: {
//                     _id: new ObjectId(), // Ensuring unique ID if inserted
//                     starting_sequence: 0, // Start from 0 if document is created
//                 },
//                 $inc: { starting_sequence: 1 }, // Increment on match
//             },
//             { upsert: true, returnDocument: 'after' }, // Return updated document
//         )

//         // Get the sequence number from the result
//         const orderNumber = result.value?.starting_sequence || 1

//         // Generate and return the formatted order code
//         return generateOrderCode(orderNumber)
//     } catch (error) {
//         console.error('Error generating order sequence:', error)
//         throw error
//     }
// }

// const { MongoClient } = require('mongodb')
const getNextOrderSequence = async (auctionId, sellerEmail) => {
    const connection = await mongodbHelper.connect()
    const client = connection.connection.getClient() // Get native MongoClient
    const session = client.startSession()

    try {
        let orderNumber

        // Use session with transaction
        await session.withTransaction(async () => {
            const query = {
                auction_id: auctionId.toString(),
                seller_email: { $regex: `^${sellerEmail}$`, $options: 'i' },
                record_type: 'Orders',
            }

            console.log('Checking/updating sequence:', query)

            const result = await client
                .db(process.env.DATABASE)
                .collection(process.env.COUNTER_LOT)
                .findOneAndUpdate(
                    query,
                    {
                        $inc: { starting_sequence: 1 }, // Atomic increment of sequence
                    },
                    {
                        upsert: true,
                        returnDocument: 'after',
                        session,
                    },
                )

            console.log('Result from counter update:', result)

            if (!result || !result.value) {
                throw new Error('Failed to generate order number')
            }

            // Get the updated sequence value
            orderNumber = result.value?.starting_sequence || 1
        })

        // Successfully committed the transaction
        session.endSession()
        return generateOrderCode(orderNumber) // Generate unique order number
    } catch (error) {
        console.error('Transaction error while generating order sequence:', error)

        // Ensure transaction is aborted only once
        if (session.inTransaction()) {
            await session.abortTransaction().catch((err) => {
                console.error('Error aborting transaction:', err)
            })
        }
        throw error
    } finally {
        session.endSession() // Always end session
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
        const lastRecord = getAuctionLots[getAuctionLots.length - 1]
        console.log(lastRecord)
        // Update the auction status to 'Completed' in MongoDB
        await mongodbHelper.update(Auction, auctionData._id, { status: 'Completed' })
        const getAllLots = await getLot('lot', client, event)
        const get_lot = getAllLots.map((item) => JSON.parse(item))
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
                // amazonq-ignore-next-line
                console.log('seller', sellerInformation)

                // Set up a MongoDB query to find the user's information
                const query = {
                    _id: new ObjectId(user.buyer_id),
                }
                const buyerInformation = await mongodbHelper.getUser(query, Buyers)

                // Loop through the lots and add them to the winning or losing lists
                for (const lot of get_lot) {
                    const rediskey = `lot:${lot._id}`
                    // console.log('rediskey', rediskey)
                    const getLotInfo = await lotDetails(rediskey, client)
                    // console.log('lot', getLotInfo)
                    const singleLot = []
                    for (let i = 0; i < getLotInfo.length; i++) {
                        singleLot.push(JSON.parse(getLotInfo[i]))
                    }
                    // Add the CDN link to the image URL
                    const featuredImage = lot.images.find((image) => image.featured)
                    lot.lot_image = `${process.env.CDN_LINK}${featuredImage ? featuredImage.url : lot.images[0].url}`
                    // console.log('lot image', lot)

                    // Add the formatted bid amount to the lot
                    if (lot.winning_user === user.buyer_id) {
                        event.lot_number = lot.lot_number
                        event.email_address = user.email_address
                        // const getAmount = await mongodbHelper.getBidAmount(event, BidInformation)
                        // console.log('won', getAmount)
                        lot.bid_amount = formatCurrency(singleLot[0].bid_amount, auctionData.currency)
                        // lot.bid_amount = formatCurrency(getAmount.bid_amount, auctionData.currency)
                        winningLot.push(lot)
                    } else {
                        event.lot_number = lot.lot_number
                        event.email_address = user.email_address
                        const getAmount = await mongodbHelper.getBidAmount(event, BidInformation)
                        if (getAmount !== null) {
                            console.log('not null')
                            // lot.bid_amount = formatCurrency(getAmount.bid_amount, auctionData.currency)
                            // fetching from redis instead of db
                            lot.bid_amount = formatCurrency(singleLot[0].bid_amount, auctionData.currency)
                            notWinning.push(lot)
                        }
                    }
                }
                // If the user didn't win any lots, change the email subject
                const subjectDescription = winningLot.length > 0 ? 'Congratulations | Payment Request' : 'You lost the Auction'
                const paymentContent = winningLot.length > 0 ? 'Please follow the link below to complete your payment.' : ''
                let totalBidAmount = 0
                if (winningLot.length > 0) {
                    totalBidAmount = winningLot.reduce((total, lot) => {
                        // Replace the currency symbol with an empty string and parse the amount to float
                        const bidAmount = parseFloat(lot.bid_amount.replace(new RegExp('[^0-9.]+', 'g'), ''))
                        return total + bidAmount
                    }, 0)
                    // Store raw number in orderAmount before formatting
                    orderAmount = Number(totalBidAmount.toFixed(2))
                    totalBidAmount = formatCurrency(totalBidAmount, auctionData.currency)

                    try {
                        // Start a transaction for order creation
                        const mongoClient = connection.connection.getClient() // Get native MongoClient
                        const mongoSession = mongoClient.startSession()
                        await mongoSession.withTransaction(async () => {
                            // Generate order number with transaction
                            const orderNumber = await getNextOrderSequence(
                                auctionData._id.toString(),
                                auctionData.seller_email,
                            )

                            const orderData = {
                                order_number: orderNumber, // Corrected this line
                                seller_email: auctionData.seller_email,
                                email_address: user.email_address,
                                name: user.name,
                                auction_id: auctionData._id,
                                auction_image: auctionData.auction_image,
                                auction_title: auctionData.title,
                                currency: auctionData.currency,
                                lots: winningLot.map((lot) => lot.lot_number),
                                amount: orderAmount,
                                payment_status: 'Pending',
                                created_at: Math.floor(Date.now() / 1000),
                                updated_at: Math.floor(Date.now() / 1000),
                            }

                            // Insert order into orders collection with session
                            await mongodbHelper.createOrder(
                                process.env.MONGO_CLIENT,
                                process.env.DATABASE,
                                process.env.ORDERS_COLLECTION,
                                orderData,
                                session,
                            )
                        })

                        mongoSession.endSession() // Commit and end session
                    } catch (error) {
                        console.error('Error creating order:', error)
                        throw error
                    }

                    const subdomainQuery = {
                        seller_email: auctionData.seller_email,
                    }
                    const auctionRedirectionURL = await mongodbHelper.getSubdomain(subdomainQuery, SubDomain)
                    const auctionId = auctionData._id.toString()
                    const checkoutURL = `https://${auctionRedirectionURL.subdomain}.${process.env.AMPLIFY_DOMAIN_NAME}/auctions/${auctionId}/checkout`
                    // Create the email data
                    if (buyerInformation.length > 0) {
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
                            seller_id: sellerInformation[0]._id,
                            total_amount: orderAmount,
                            checkout_url: checkoutURL,
                        }

                        promiseList.push(sendTemplateEmails(user.email_address, template_data))
                    }
                }

                // Run all the promises in parallel
                await Promise.all(promiseList)
            }
            // clear the cache
            if (lastRecord.lot_number === event.lot_number) {
                for (const lot of get_lot) {
                    const redisKeys = `lot:${lot._id}`
                    const clearingCacheLot = await client.hset('lot', redisKeys, JSON.stringify({}))
                    const clearingCacheLotHistory = await client.del(`lot-history:${lot._id}`)
                    const clearAuctionHistory = await client.del(`auction:${auctionData.auction_id}#${lot._id}`)
                    console.log('clearingCache', clearAuctionHistory, clearingCacheLotHistory, clearingCacheLot)
                }
            }
            return true
        }
    } catch (err) {
        console.log('err', err)
        return err
    }
}
