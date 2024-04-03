// /* eslint-disable no-restricted-globals */
// /* eslint-disable no-console */
// /* eslint-disable no-underscore-dangle */
// /* eslint-disable import/no-unresolved */
// /* eslint-disable import/extensions */
// /* eslint-disable no-plusplus */
// /* eslint-disable no-param-reassign */
// /* eslint-disable import/no-extraneous-dependencies */
// /* eslint-disable no-restricted-syntax */
// /* eslint-disable camelcase */
// /* eslint-disable array-callback-return */
// /* eslint-disable no-await-in-loop */

// const {
//     PinpointEmail,
// } = require('aws-sdk')
// const { ObjectId } = require('mongodb')
// const Auction = require('../entities/Auction')
// const mongodbHelper = require('../lib/mongodb_helper')
// const redisHelper = require('../lib/redis_helper')
// const BidInformation = require('../entities/BidInformation')
// const Users = require('../entities/Users')
// const Buyers = require('../entities/Buyers')

// const pinpoint = new PinpointEmail()

// mongodbHelper.connect()

// async function getLot(rediskey, client, auctionData) {
//     const allBidders = await client.hgetall(rediskey)
//     return Object.values(allBidders || {}).filter((bidder) => {
//         const parsedBidder = JSON.parse(bidder)
//         return parsedBidder.seller_email === auctionData.seller_email && parsedBidder.auction_id === auctionData.auction_id
//     })
// }

// function formatCurrency(amount, currencyCode) {
//     try {
//         // Convert amount to a string
//         const amountString = String(amount)

//         // Remove currency symbol and commas
//         const cleanedAmount = amountString.replace(/[^\d.]/g, '')

//         const parsedAmount = parseFloat(cleanedAmount)

//         if (isNaN(parsedAmount)) {
//             console.error('Invalid amount:', amountString)
//             return 'Invalid amount'
//         }

//         // Include commas and currency symbol in the formatted result
//         const formattedAmount = new Intl.NumberFormat('en-US', {
//             style: 'currency',
//             currency: currencyCode,
//             minimumFractionDigits: 2, // Adjust as needed
//             maximumFractionDigits: 2, // Adjust as needed
//         }).format(parsedAmount)

//         return formattedAmount
//     } catch (err) {
//         console.error(err)
//         return 'Error formatting currency'
//     }
// }

// async function sendMail(destinationId, sourceId, templateData, templateArn) {
//     const params = {
//         Content: {
//             Template: {
//                 TemplateArn: templateArn,
//                 TemplateData: templateData,
//             },
//         },
//         FromEmailAddress: process.env.SENDER_EMAIL,
//         Destination: {
//             ToAddresses: [destinationId],
//         },
//     }
//     try {
//         await pinpoint.sendEmail(params).promise()
//     } catch (error) {
//         console.error('Failed to send email:', error)
//     }
// }

// module.exports.sqsTriggerFunction = async (event) => {
//     try {
//         const getBidders = await mongodbHelper.getBidders(event, BidInformation)
//         console.log('getBidders', getBidders)
//         const client = await redisHelper.createRedisClient()
//         const getAllLots = await getLot('lot', client, event)
//         const get_lot = getAllLots.map((item) => JSON.parse(item))
//         console.log('getlott', get_lot)
//         const auctionData = await mongodbHelper.getAuction(event, Auction)

//         const promiseList = getBidders.map(async (user) => {
//             const winningLot = []
//             const notWinning = []
//             const query = {
//                 _id: new ObjectId(user.buyer_id),
//             }
//             const sellerQuery = {
//                 email_address: event.seller_email,
//             }
//             const buyerInformation = await mongodbHelper.getUser(query, Buyers)
//             const sellerInformation = await mongodbHelper.getUser(sellerQuery, Users)
//             console.log(sellerInformation, 'sellerInformation')
//             console.log('buyerInformation', buyerInformation)
//             let subjectDescription = 'You Won the Auction'
//             get_lot.forEach((item) => {
//                 item.lot_image = `${process.env.CDN_LINK}${item.images[0].url}`
//                 if (item.winning_user === user.buyer_id) {
//                     item.bid_amount = formatCurrency(item.bid_amount, auctionData.currency)
//                     winningLot.push(item)
//                 } else if (item.winning_user !== user.buyer_id) {
//                     item.bid_amount = formatCurrency(item.starting_price, auctionData.currency)
//                     notWinning.push(item)
//                 }
//             })

//             if (winningLot.length <= 0) {
//                 subjectDescription = 'You lost the Auction'
//             }
//             const template_data = {
//                 winning_lot: winningLot.sort((a, b) => a.lot_number - b.lot_number),
//                 winning_lot_count: winningLot.length,
//                 buyer: buyerInformation[0].first_name === '' ? 'Customer' : `${buyerInformation[0].first_name} ${buyerInformation[0].last_name}`,
//                 title: auctionData.title,
//                 logo_url: auctionData.logo_image === '' ? `${process.env.S3_BUCKET_URL}/Logo.png` : `${process.env.S3_BUCKET_URL}/${auctionData.logo_image}`,
//                 not_winning_lot: notWinning.sort((a, b) => a.lot_number - b.lot_number),
//                 not_winning_lot_count: notWinning.length,
//                 seller_name: sellerInformation[0].first_name === '' ? 'User' : `${sellerInformation[0].first_name} ${sellerInformation[0].last_name}`,
//                 seller_email: auctionData.seller_email,
//                 subject: subjectDescription,
//             }

//             return sendMail(user.email_address, process.env.SENDER_EMAIL_ADDRESS, JSON.stringify(template_data), process.env.TEMPLATE_ARN_AUCTION_COMPLETION)
//         })

//         await Promise.all(promiseList)

//         await mongodbHelper.update(Auction, auctionData._id, { status: 'Completed' })
//     } catch (err) {
//         console.log('err', err)
//     }
// }

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
const Users = require('../entities/Users')
const Buyers = require('../entities/Buyers')

const pinpoint = new PinpointEmail()

mongodbHelper.connect()
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
        await pinpoint.sendEmail(params).promise()
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
        // if (connection === null || !connection.readyState) {
        // connection = await mongodbHelper.connect()
        // }
        // Retrieve the bidders from MongoDB
        const getBidders = await mongodbHelper.getBidders(event, BidInformation)

        // Connect to Redis and retrieve the auction lots
        const client = await redisHelper.createRedisClient()
        const getAllLots = await getLot('lot', client, event)

        // Create objects to store the lot and user information
        const get_lot = getAllLots.map((item) => JSON.parse(item))

        // Retrieve the auction data from MongoDB
        const auctionData = await mongodbHelper.getAuction(event, Auction)

        // Create an array of promises to send an email to each user
        // const promiseList = getBidders.map(async (user) => {
        //     // Create arrays to store the winning and losing lots
        //     const winningLot = []
        //     const notWinning = []

        //     // Set up a MongoDB query to find the user's information
        //     const query = {
        //         _id: new ObjectId(user.buyer_id),
        //     }

        //     // Set up a MongoDB query to find the seller's information
        //     const sellerQuery = {
        //         email_address: event.seller_email,
        //     }

        //     // Get the user and seller information from MongoDB
        //     const buyerInformation = await mongodbHelper.getUser(query, Buyers)
        //     const sellerInformation = await mongodbHelper.getUser(sellerQuery, Users)

        //     // Set the email subject based on whether the user won or lost the auction
        //     let subjectDescription = 'You Won the Auction'

        //     // Loop through the lots and add them to the winning or losing lists
        //     get_lot.forEach((item) => {
        //         // Add the CDN link to the image URL
        //         item.lot_image = `${process.env.CDN_LINK}${item.images[0].url}`

        //         // Add the formatted bid amount to the lot
        //         if (item.winning_user === user.buyer_id) {
        //             item.bid_amount = formatCurrency(item.bid_amount, auctionData.currency)
        //             winningLot.push(item)
        //         } else if (item.winning_user !== user.buyer_id) {
        //             item.bid_amount = formatCurrency(item.starting_price, auctionData.currency)
        //             notWinning.push(item)
        //         }
        //     })

        //     // If the user didn't win any lots, change the email subject
        //     if (winningLot.length <= 0) {
        //         subjectDescription = 'You lost the Auction'
        //     }

        //     // Create the email data
        //     const template_data = {
        //         winning_lot: winningLot.sort((a, b) => a.lot_number - b.lot_number),
        //         winning_lot_count: winningLot.length,
        //         buyer: buyerInformation[0].first_name === '' ? 'Customer' : `${buyerInformation[0].first_name} ${buyerInformation[0].last_name}`,
        //         title: auctionData.title,
        //         logo_url: auctionData.logo_image === '' ? `${process.env.S3_BUCKET_URL}/Logo.png` : `${process.env.S3_BUCKET_URL}/${auctionData.logo_image}`,
        //         not_winning_lot: notWinning.sort((a, b) => a.lot_number - b.lot_number),
        //         not_winning_lot_count: notWinning.length,
        //         seller_name: sellerInformation[0].first_name === '' ? 'User' : `${sellerInformation[0].first_name} ${sellerInformation[0].last_name}`,
        //         seller_email: auctionData.seller_email,
        //         subject: subjectDescription,
        //     }

        //     return sendMail(user.email_address, process.env.SENDER_EMAIL_ADDRESS, JSON.stringify(template_data), process.env.TEMPLATE_ARN_AUCTION_COMPLETION)
        // })

        // // Wait for all the emails to be sent
        // await Promise.all(promiseList)

        const winningLot = []
        const notWinning = []
        // Set up a MongoDB query to find the seller's information
        const sellerQuery = {
            email_address: event.seller_email,
        }
        const sellerInformation = await mongodbHelper.getUser(sellerQuery, Users)
        for (const user of getBidders) {
            // Set up a MongoDB query to find the user's information
            const query = {
                _id: new ObjectId(user.buyer_id),
            }

            const buyerInformation = await mongodbHelper.getUser(query, Buyers)
            // Set the email subject based on whether the user won or lost the auction
            let subjectDescription = 'You Won the Auction'
            // Loop through the lots and add them to the winning or losing lists
            get_lot.forEach((lot) => {
                // Add the CDN link to the image URL
                lot.lot_image = `${process.env.CDN_LINK}${lot.images[0].url}`

                // Add the formatted bid amount to the lot
                if (lot.winning_user === user.buyer_id) {
                    lot.bid_amount = formatCurrency(user.bid_amount, auctionData.currency)
                    winningLot.push(lot)
                } else if (lot.winning_user !== user.buyer_id) {
                    lot.bid_amount = formatCurrency(lot.starting_price, auctionData.currency)
                    notWinning.push(lot)
                }
            })
            // If the user didn't win any lots, change the email subject
            if (winningLot.length <= 0) {
                subjectDescription = 'You lost the Auction'
            }

            // Create the email data
            const template_data = {
                winning_lot: winningLot.sort((a, b) => a.lot_number - b.lot_number),
                winning_lot_count: winningLot.length,
                buyer: buyerInformation[0].first_name === '' ? 'Customer' : `${buyerInformation[0].first_name} ${buyerInformation[0].last_name}`,
                title: auctionData.title,
                logo_url: auctionData.logo_image === '' ? `${process.env.S3_BUCKET_URL}/Logo.png` : `${process.env.S3_BUCKET_URL}/${auctionData.logo_image}`,
                not_winning_lot: notWinning.sort((a, b) => a.lot_number - b.lot_number),
                not_winning_lot_count: notWinning.length,
                seller_name: sellerInformation[0].first_name === '' ? 'User' : `${sellerInformation[0].first_name} ${sellerInformation[0].last_name}`,
                seller_email: auctionData.seller_email,
                subject: subjectDescription,
            }

            await sendMail(user.email_address, process.env.SENDER_EMAIL_ADDRESS, JSON.stringify(template_data), process.env.TEMPLATE_ARN_AUCTION_COMPLETION)
        }
        // Run all the promises in parallel

        // Update the auction status to 'Completed' in MongoDB
        await mongodbHelper.update(Auction, auctionData._id, { status: 'Completed' })
    } catch (err) {
        console.log('err', err)
    }
}
