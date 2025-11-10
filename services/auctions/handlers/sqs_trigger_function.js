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
/* eslint-disable no-continue */

const { ObjectId } = require('mongodb')
const Auction = require('../entities/Auction')
const mongodbHelper = require('../lib/mongodb_helper')
const redisHelper = require('../lib/redis_helper')
const BidInformation = require('../entities/BidInformation')
const UniqueBid = require('../entities/Bid')
const Users = require('../entities/Users')
const Buyers = require('../entities/Buyers')
const SubDomain = require('../entities/SubDomain')
const Lot = require('../entities/Lot')
const Cart = require('../entities/Cart')
const { sendTemplateEmails } = require('../lib/mailchimp_helper')

let connection = null
let client

// Add a Set to track processed auctions to prevent duplicates
const processedAuctions = new Set()

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
        try {
            const cleanBidder = bidder.replace(/"/g, '"')
            const parsedBidder = JSON.parse(cleanBidder)
            return parsedBidder.seller_email === auctionData.seller_email && parsedBidder.auction_id === auctionData.auction_id
        } catch (err) {
            console.error('Parse error at line 55:', err.message)
            return false
        }
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
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(parsedAmount)

        return formattedAmount
    } catch (err) {
        console.error(err)
        return 'Error formatting currency'
    }
}

/**
 * Generates an order code with prefix "OD" and padded zeros
 * @param {number} number The order number to format
 * @returns {string} The formatted order code
 */
function generateOrderCode(number) {
    return `OD${String(number).padStart(4, '0')}`
}

/**
 * Adds winning lots to cart for a specific buyer
 * @param {object} lotInformation The lot information from Redis
 * @param {object} auctionData The auction data
 * @param {object} buyerData The buyer data
 * @returns {Promise<void>}
 */
async function addWinningLotToCart(lotInformation, auctionData, buyerData) {
    try {
        if (buyerData && Object.keys(buyerData).length > 0) {
            console.log('Adding winning lot to cart for buyer:', buyerData.email_address)
            lotInformation.email_address = buyerData.email_address || null
            lotInformation.name = buyerData.first_name || null
            await mongodbHelper.lotToCart(lotInformation, auctionData, Cart)
        }
    } catch (err) {
        console.error('Error adding lot to cart:', err)
        throw err
    }
}

/**
 * Handle the AWS SQS trigger event for the auction completion job
 *
 * This function retrieves the bidders from MongoDB, retrieves the lots from Redis,
 * adds winning lots to cart, and sends an email to each buyer using the AWS Pinpoint service.
 * The function updates the auction status to 'Completed' in MongoDB after all emails have been sent.
 *
 * @param {object} event - The event object from the AWS SQS trigger
 * @returns {Promise<void>}
 */
module.exports.sqsTriggerFunction = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            connection = await mongodbHelper.connect()
        }
        console.log('event', event)

        // Create a unique identifier for this auction to prevent duplicate processing
        const auctionKey = `${event.auction_id}_${event.seller_email}`

        // Check if this auction has already been processed
        if (processedAuctions.has(auctionKey)) {
            console.log(`Auction ${auctionKey} already processed, skipping duplicate processing`)
            return true
        }

        // Mark this auction as being processed
        processedAuctions.add(auctionKey)
        console.log(`Processing auction ${auctionKey}`)

        // Retrieve the bidders from MongoDB
        const getBidders = await mongodbHelper.getBidders(event, BidInformation)

        // Connect to Redis and retrieve the auction lots
        client = await redisHelper.getClient()

        const auctionData = await mongodbHelper.getAuction(event, Auction)

        // Double-check auction status to prevent processing completed auctions
        if (auctionData.status === 'Completed') {
            console.log(`Auction ${auctionKey} already completed, skipping processing`)
            processedAuctions.delete(auctionKey) // Remove from processed set
            return true
        }

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

        // Process winning lots and add them to cart BEFORE sending emails
        // Only for 'All Lots' - Individual/Cascade lots are already added immediately
        if (auctionData.extension_type === 'All Lots') {
            console.log('Processing winning lots and adding to cart for All Lots auction...')
            for (const lot of get_lot) {
                const rediskey = `lot:${lot._id}`
                const getLotInfo = await lotDetails(rediskey, client)
                const singleLot = []
                for (let i = 0; i < getLotInfo.length; i++) {
                    singleLot.push(JSON.parse(getLotInfo[i]))
                }

                const lotInformation = singleLot[0]

                // Only add to cart if there's a winning user
                if (lotInformation && lotInformation.winning_user) {
                    console.log(`Processing winning lot ${lot.lot_number} for user ${lotInformation.winning_user}`)
                    const getBuyerData = await mongodbHelper.getBuyer(lotInformation.winning_user, Buyers)

                    if (getBuyerData && Object.keys(getBuyerData).length > 0) {
                        await addWinningLotToCart(lotInformation, auctionData, getBuyerData)
                    }
                }
            }
        } else {
            console.log('Skipping cart addition - Individual/Cascade lots already added immediately')
        }

        if (getBidders.length > 0) {
            // Initialize empty array to store promiseList
            const promiseList = []

            // Loop through bidders
            // amazonq-ignore-next-line
            for (const user of getBidders) {
                // Retrieve the auction lots for each bidder
                // Reset lists for each bidder
                const winningLot = []
                const notWinning = []

                // Set up a MongoDB query to find the seller's information
                const sellerQuery = {
                    email_address: event.seller_email,
                }
                const sellerInformation = await mongodbHelper.getUser(sellerQuery, Users)
                console.log('seller', sellerInformation)

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
                    const featuredImage = lot.images.find((image) => image.featured)

                    // CREATE A DEEP COPY OF THE LOT FOR THIS BIDDER
                    const lotForThisBidder = JSON.parse(JSON.stringify(lot))
                    lotForThisBidder.lot_image = `${process.env.CDN_LINK}${featuredImage ? featuredImage.url : lot.images[0].url}`

                    // Add the formatted bid amount to the lot
                    if (lot.winning_user === user.buyer_id) {
                        event.lot_number = lot.lot_number
                        event.email_address = user.email_address
                        event.lot_id = lot._id
                        event.buyer_id = user.buyer_id
                        const getAmount = await mongodbHelper.getBid(event, UniqueBid)
                        lotForThisBidder.bid_amount = formatCurrency(getAmount.bid_amount, auctionData.currency)
                        winningLot.push(lotForThisBidder)
                    } else {
                        event.lot_number = lot.lot_number
                        event.email_address = user.email_address
                        event.lot_id = lot._id
                        event.buyer_id = user.buyer_id
                        const getAmount = await mongodbHelper.getBid(event, UniqueBid)
                        if (getAmount !== null) {
                            console.log('getAmount is not null')
                            lotForThisBidder.bid_amount = formatCurrency(getAmount.max_bid, auctionData.currency)
                            notWinning.push(lotForThisBidder)
                        }
                    }
                }

                // Process winning lots and create orders
                if (winningLot.length > 0) {
                    // If the user didn't win any lots, change the email subject
                    const subjectDescription = 'Congratulations | Payment Request'
                    const paymentContent = 'Please follow the link below to complete your payment.'
                    let totalBidAmount = 0
                    let orderAmount = 0

                    totalBidAmount = winningLot.reduce((total, lot) => {
                        // Replace the currency symbol with an empty string and parse the amount to float
                        const bidAmount = parseFloat(lot.bid_amount.replace(new RegExp('[^0-9.]+', 'g'), ''))
                        console.log(`Lot ${lot.lot_number}: bid_amount = ${lot.bid_amount}, parsed = ${bidAmount}`)
                        return total + bidAmount
                    }, 0)
                    // Store raw number in orderAmount before formatting
                    orderAmount = Number(totalBidAmount.toFixed(2))
                    console.log(`User ${user.email_address}: Total calculated = ${totalBidAmount}, Final orderAmount = ${orderAmount}`)
                    totalBidAmount = formatCurrency(totalBidAmount, auctionData.currency)

                    // FOR ALL LOTS: Send email BEFORE order creation
                    if (auctionData.extension_type === 'All Lots') {
                        const subdomainQuery = {
                            seller_email: auctionData.seller_email,
                        }
                        const auctionRedirectionURL = await mongodbHelper.getSubdomain(subdomainQuery, SubDomain)
                        const auctionId = auctionData._id.toString()
                        const checkoutURL = `https://${auctionRedirectionURL.subdomain}.${process.env.AMPLIFY_DOMAIN_NAME}/auctions/${auctionId}/checkout`

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
                            if (sellerInformation[0].send_automated_auction_complete_email) {
                                promiseList.push(sendTemplateEmails(user.email_address, template_data))
                            }
                        }
                    }

                    try {
                        // Get the first winning lot number to generate order number
                        const firstWinningLotNumber = winningLot[0].lot_number
                        const orderNumber = generateOrderCode(firstWinningLotNumber)
                        let auctionImage = null

                        console.log('auction data', auctionData)

                        if (auctionData.template_name?.trim() === 'Single Lot') {
                            const imagesRaw = auctionData.auction_image

                            if (Array.isArray(imagesRaw) && imagesRaw.length > 0) {
                                const featured = imagesRaw.find((img) => img && img.featured)
                                auctionImage = featured?.url || imagesRaw[0]?.url || null
                            } else if (imagesRaw && typeof imagesRaw === 'object' && imagesRaw.url) {
                                // In case it's a single image object, not an array
                                auctionImage = imagesRaw.url
                            } else {
                                console.warn('Images missing or in unexpected format:', imagesRaw)
                            }
                        } else {
                            auctionImage = auctionData.auction_image
                        }

                        console.log('Final Auction Image:', auctionImage)

                        console.log(`Creating order for ${user.email_address} with amount: ${orderAmount}`)

                        const orderData = {
                            seller_email: auctionData.seller_email,
                            email_address: user.email_address,
                            name: user.name,
                            auction_id: auctionData._id.toString(),
                            auction_image: auctionImage,
                            auction_title: auctionData.title,
                            currency: auctionData.currency,
                            lots: winningLot.map((lot) => lot.lot_number),
                            amount: orderAmount,
                            payment_status: 'Pending',
                            created_at: Math.floor(Date.now() / 1000),
                            updated_at: Math.floor(Date.now() / 1000),
                        }

                        const orderExists = await mongodbHelper.getOrder(
                            process.env.MONGO_CLIENT,
                            process.env.DATABASE,
                            process.env.ORDERS_COLLECTION,
                            {
                                seller_email: auctionData.seller_email,
                                email_address: user.email_address,
                                auction_id: auctionData._id.toString(),
                            },
                        )

                        // Update order number
                        orderData.order_number = orderNumber

                        if (!orderExists) {
                            // Insert order into orders collection
                            await mongodbHelper.createOrder(
                                process.env.MONGO_CLIENT,
                                process.env.DATABASE,
                                process.env.ORDERS_COLLECTION,
                                orderData,
                            )
                        }

                        const cartUpdateCondition = {
                            seller_email: auctionData.seller_email,
                            email_address: user.email_address,
                            auction_id: auctionData._id.toString(),
                        }
                        const cartUpdateData = {
                            payment_status: 'Pending',
                            order_number: orderNumber,
                        }
                        await mongodbHelper.updateCart(
                            process.env.MONGO_CLIENT,
                            process.env.DATABASE,
                            process.env.CARTTABLE,
                            cartUpdateCondition,
                            cartUpdateData,
                        )
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

                    // FOR NON-ALL LOTS: Send email AFTER order creation (existing behavior)
                    if (auctionData.extension_type !== 'All Lots') {
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
                            // Check if seller has enabled automated auction completion emails
                            if (!sellerInformation[0].send_automated_auction_complete_email) {
                                console.log(`Skipping email for auction ${event.auction_id} - seller ${event.seller_email} has disabled automated auction completion emails`)
                                continue
                            }
                            promiseList.push(sendTemplateEmails(user.email_address, template_data))
                        }
                    }
                } else {
                    // Handle users who didn't win any lots
                    const subjectDescription = 'You lost the Auction'
                    const paymentContent = ''

                    if (buyerInformation.length > 0) {
                        const template_data = {
                            winning_lot: [],
                            winning_lot_count: 0,
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
                            total_amount: 0,
                            checkout_url: '',
                        }
                        // Check if seller has enabled automated auction completion emails
                        if (!sellerInformation[0].send_automated_auction_complete_email) {
                            console.log(`Skipping email for auction ${event.auction_id} - seller ${event.seller_email} has disabled automated auction completion emails`)
                            continue
                        }
                        promiseList.push(sendTemplateEmails(user.email_address, template_data))
                    }
                }
            }

            // Run all the promises in parallel
            await Promise.all(promiseList)

            // Clear the cache only after processing is complete
            if (lastRecord.lot_number === event.lot_number) {
                for (const lot of get_lot) {
                    const redisKeys = `lot:${lot._id}`
                    const redisDataKeys = {
                        lot_key: redisKeys,
                        lot_history_key: `lot-history:${lot._id}`,
                        auction_history_key: `auction:${auctionData.auction_id}#${lot._id}`,
                    }
                    // Use the new helper function that utilizes the Mongoose model
                    const savedDataKeys = await mongodbHelper.saveRedisDataKeys(redisDataKeys)
                    if (savedDataKeys) {
                        console.log(`Stored redis keys in redis-cron-data collection for lot ${lot._id}, doc ID: ${savedDataKeys._id}`)
                    } else {
                        console.error(`Failed to store redis keys in redis-cron-data for lot ${lot._id}`)
                    }
                }
            }
        }

        // Remove from processed set after successful completion
        processedAuctions.delete(auctionKey)
        console.log(`Completed processing auction ${auctionKey}`)

        return true
    } catch (err) {
        console.log('err', err)
        // Remove from processed set on error so it can be retried
        const auctionKey = `${event.auction_id}_${event.seller_email}`
        processedAuctions.delete(auctionKey)
        return err
    }
}
