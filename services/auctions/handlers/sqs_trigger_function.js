/* eslint-disable no-continue */
/* eslint-disable no-underscore-dangle */
/* eslint-disable consistent-return */
/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-plusplus */
/* eslint-disable no-param-reassign */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-restricted-syntax */
/* eslint-disable camelcase */
/* eslint-disable array-callback-return */
/* eslint-disable no-await-in-loop */

const Auction = require('../entities/Auction')
const mongodbHelper = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
const Buyers = require('../entities/Buyers')
const SubDomain = require('../entities/SubDomain')
const Lot = require('../entities/Lot')
const { sendTemplateEmails } = require('../lib/mailchimp_helper')

let connection = null

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
        if (Number.isNaN(parsedAmount)) {
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
 * Handles sending consolidated payment request emails after an auction ends.
 *
 * @param {object} event - The event object containing auction_id and seller_email.
 * @returns {object} - A response object indicating success or failure.
 */
module.exports.sqsTriggerFunction = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            connection = await mongodbHelper.connect()
        }
        console.log('event', event)

        // Validate input parameters
        if (!event || !event.auction_id || !event.seller_email) {
            throw new Error('Missing required parameters: auction_id and seller_email must be provided')
        }

        const auctionId = event.auction_id
        const sellerEmail = event.seller_email

        // Get auction data
        const auctionData = await mongodbHelper.getAuction({ auction_id: auctionId, seller_email: sellerEmail }, Auction)
        if (!auctionData) {
            throw new Error(`Auction not found for auction_id: ${auctionId} and seller_email: ${sellerEmail}`)
        }

        // Check if emails have already been sent for this auction
        if (auctionData.payment_emails_sent) {
            console.log(`Payment emails already sent for auction ${auctionId}. Skipping.`)
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Payment emails already sent, skipping duplicate' }),
            }
        }

        // Retrieve all winning lots for the auction
        const winningLots = await mongodbHelper.getAuctionLots(
            { auction_id: auctionId, seller_email: sellerEmail, winning_user: { $exists: true } },
            Lot,
        )

        if (!winningLots || winningLots.length === 0) {
            console.log(`No winning lots found for auction ${auctionId}`)
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'No winning lots found, no emails sent' }),
            }
        }

        // Group winning lots by bidder
        const winningLotsByBidder = winningLots.reduce((acc, lot) => {
            if (!lot.winning_user) return acc
            if (!acc[lot.winning_user]) {
                acc[lot.winning_user] = []
            }
            acc[lot.winning_user].push(lot)
            return acc
        }, {})

        const promiseList = []
        const currencyCode = auctionData.currency || 'USD' // Default to USD if not specified

        // Process each bidder's winning lots
        for (const [buyerId, bidderWinningLots] of Object.entries(winningLotsByBidder)) {
            try {
                if (!bidderWinningLots || bidderWinningLots.length === 0) continue

                // Retrieve bidder information
                const buyerInformation = await mongodbHelper.getBuyer(buyerId, Buyers)
                if (!buyerInformation || Object.keys(buyerInformation).length === 0) {
                    console.warn(`Bidder information not found for buyerId: ${buyerId}`)
                    continue
                }

                // Retrieve seller information
                const sellerInformation = await mongodbHelper.getUser({ email_address: sellerEmail }, Users)
                if (!sellerInformation || sellerInformation.length === 0) {
                    console.warn(`Seller information not found for email: ${sellerEmail}`)
                    continue
                }

                // Calculate total amount for winning lots and format bid amounts
                let totalBidAmount = 0
                const formattedWinningLots = bidderWinningLots.map((lot) => {
                    const featuredImage = lot.images?.find((image) => image.featured)
                    const firstImage = lot.images?.[0]?.url
                    lot.lot_image = `${process.env.CDN_LINK}${featuredImage?.url || firstImage || ''}`

                    const bidAmount = parseFloat(lot.current_bid || 0)
                    totalBidAmount += bidAmount
                    return {
                        ...lot,
                        bid_amount: formatCurrency(bidAmount, currencyCode),
                    }
                })

                const orderAmount = Number(totalBidAmount.toFixed(2))

                // Check if an order already exists for this auction and buyer
                const existingOrderForBuyer = await mongodbHelper.getOrder(
                    process.env.MONGO_CLIENT,
                    process.env.DATABASE,
                    process.env.ORDERS_COLLECTION,
                    { auction_id: auctionData._id.toString(), email_address: buyerInformation.email_address },
                )

                let orderNumber
                if (existingOrderForBuyer) {
                    orderNumber = existingOrderForBuyer.order_number
                    console.log(`Existing order found for auction ${auctionData._id} and buyer ${buyerInformation.email_address}. Using order number: ${orderNumber}`)
                } else {
                    // Get the first winning lot number to generate order number if no existing order
                    const firstWinningLotNumber = formattedWinningLots[0]?.lot_number || 1
                    orderNumber = generateOrderCode(firstWinningLotNumber)
                    console.log(`No existing order found. Generating new order number: ${orderNumber}`)
                }

                // Handle auction image
                let auctionImage = null
                if (auctionData.template_name?.trim() === 'Single Lot') {
                    const imagesRaw = auctionData.auction_image
                    if (Array.isArray(imagesRaw) && imagesRaw.length > 0) {
                        const featured = imagesRaw.find((img) => img?.featured)
                        auctionImage = featured?.url || imagesRaw[0]?.url || null
                    } else if (imagesRaw && typeof imagesRaw === 'object' && imagesRaw.url) {
                        auctionImage = imagesRaw.url
                    }
                } else {
                    auctionImage = auctionData.auction_image
                }

                const orderData = {
                    order_number: orderNumber,
                    seller_email: auctionData.seller_email,
                    email_address: buyerInformation.email_address,
                    name: buyerInformation.first_name || 'Customer',
                    auction_id: auctionData._id.toString(),
                    auction_image: auctionImage,
                    auction_title: auctionData.title,
                    currency: currencyCode,
                    lots: formattedWinningLots.map((lot) => lot.lot_number),
                    amount: orderAmount,
                    payment_status: 'Pending',
                    created_at: Math.floor(Date.now() / 1000),
                    updated_at: Math.floor(Date.now() / 1000),
                }

                // Insert or update order
                if (existingOrderForBuyer) {
                    await mongodbHelper.updateOrder(
                        process.env.MONGO_CLIENT,
                        process.env.DATABASE,
                        process.env.ORDERS_COLLECTION,
                        { _id: existingOrderForBuyer._id },
                        { $set: orderData },
                    )
                } else {
                    await mongodbHelper.createOrder(
                        process.env.MONGO_CLIENT,
                        process.env.DATABASE,
                        process.env.ORDERS_COLLECTION,
                        orderData,
                    )
                }

                // Skip if payment email was already sent
                if (existingOrderForBuyer?.payment_email_sent) {
                    console.log(`Payment request email already sent for order number: ${orderNumber}. Skipping.`)
                    continue
                }

                // Update cart
                const cartUpdateCondition = {
                    seller_email: auctionData.seller_email,
                    email_address: buyerInformation.email_address,
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

                // Get subdomain for checkout URL
                const subdomainQuery = { seller_email: auctionData.seller_email }
                const auctionRedirectionURL = await mongodbHelper.getSubdomain(subdomainQuery, SubDomain)
                if (!auctionRedirectionURL?.subdomain) {
                    throw new Error(`Subdomain not found for seller: ${auctionData.seller_email}`)
                }

                const auctionIdString = auctionData._id.toString()
                const checkoutURL = `https://${auctionRedirectionURL.subdomain}.${process.env.AMPLIFY_DOMAIN_NAME}/auctions/${auctionIdString}/checkout`

                // Prepare email template data
                const template_data = {
                    winning_lot: formattedWinningLots.sort((a, b) => (a.lot_number || 0) - (b.lot_number || 0)),
                    winning_lot_count: formattedWinningLots.length,
                    buyer: buyerInformation.first_name ? `${buyerInformation.first_name} ${buyerInformation.last_name || ''}`.trim() : 'Customer',
                    title: auctionData.title || 'Auction',
                    logo_url: auctionData.logo_image ? `${process.env.S3_BUCKET_URL}${auctionData.logo_image}` : `${process.env.S3_BUCKET_URL}Logo.png`,
                    not_winning_lot: [],
                    not_winning_lot_count: 0,
                    seller_name: sellerInformation[0].first_name ? `${sellerInformation[0].first_name} ${sellerInformation[0].last_name || ''}`.trim() : 'User',
                    seller_email: auctionData.seller_email,
                    subject: 'Congratulations | Payment Request',
                    paymentContent: 'Please follow the link below to complete your payment.',
                    seller_id: sellerInformation[0]._id,
                    total_amount: formatCurrency(orderAmount, currencyCode),
                    checkout_url: checkoutURL,
                }

                // Add email sending to promise list
                promiseList.push(
                    sendTemplateEmails(buyerInformation.email_address, template_data)
                        .catch((emailError) => {
                            console.error(`Failed to send email to ${buyerInformation.email_address}:`, emailError)
                        }),
                )

                // Mark email as sent in order record
                await mongodbHelper.updateOrder(
                    process.env.MONGO_CLIENT,
                    process.env.DATABASE,
                    process.env.ORDERS_COLLECTION,
                    { order_number: orderNumber },
                    { $set: { payment_email_sent: true, updated_at: Math.floor(Date.now() / 1000) } },
                )
            } catch (error) {
                console.error(`Error processing bidder ${buyerId}:`, error)
                // Continue with next bidder even if one fails
            }
        }

        // Wait for all emails to be sent
        await Promise.all(promiseList)

        // Update auction status
        await mongodbHelper.update(
            Auction,
            auctionData._id,
            {
                status: 'Completed',
                payment_emails_sent: true,
                payment_emails_sent_at: Math.floor(Date.now() / 1000),
            },
        )

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Consolidated payment request emails sent successfully' }),
        }
    } catch (err) {
        console.error('Error in sqsTriggerFunction:', err)
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message || 'Internal server error' }),
        }
    }
}
