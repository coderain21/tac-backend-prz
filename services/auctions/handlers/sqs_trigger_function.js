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

        const auctionId = event.auction_id
        const sellerEmail = event.seller_email

        // Retrieve all winning lots for the auction
        const winningLots = await mongodbHelper.getAuctionLots({ auction_id: auctionId, seller_email: sellerEmail, winning_user: { $exists: true } }, Lot)

        // Group winning lots by bidder
        const winningLotsByBidder = winningLots.reduce((acc, lot) => {
            if (!acc[lot.winning_user]) {
                acc[lot.winning_user] = []
            }
            acc[lot.winning_user].push(lot)
            return acc
        }, {})

        const promiseList = []
        let auctionData = null // Declare auctionData outside the loop

        // Iterate through unique bidders who won lots
        for (const buyerId in winningLotsByBidder) {
            if (Object.hasOwnProperty.call(winningLotsByBidder, buyerId)) {
                const bidderWinningLots = winningLotsByBidder[buyerId]

                // Retrieve bidder information
                const buyerInformation = await mongodbHelper.getBuyer(buyerId, Buyers)
                if (!buyerInformation || Object.keys(buyerInformation).length === 0) {
                    console.warn(`Bidder information not found for buyerId: ${buyerId}`)
                } else {
                    // Retrieve seller information
                    const sellerInformation = await mongodbHelper.getUser({ email_address: sellerEmail }, Users)
                    if (!sellerInformation || sellerInformation.length === 0) {
                        console.warn(`Seller information not found for email: ${sellerEmail}`)
                    } else {
                        // Retrieve auction data
                        auctionData = await mongodbHelper.getAuction({ auction_id: auctionId, seller_email: sellerEmail }, Auction) // Assign to the outer scope variable
                        if (!auctionData) {
                            console.warn(`Auction data not found for auctionId: ${auctionId}`)
                        } else {
                            // Calculate total amount for winning lots and format bid amounts
                            let totalBidAmount = 0
                            const currencyCode = auctionData.currency // Define currencyCode before map
                            const formattedWinningLots = bidderWinningLots.map((lot) => {
                                const featuredImage = lot.images.find((image) => image.featured)
                                lot.lot_image = `${process.env.CDN_LINK}${featuredImage ? featuredImage.url : lot.images[0].url}`
                                const bidAmount = parseFloat(lot.bid_amount) // Assuming bid_amount is stored as a number
                                totalBidAmount += bidAmount
                                return {
                                    ...lot,
                                    bid_amount: formatCurrency(bidAmount, currencyCode),
                                }
                            })

                            const orderAmount = Number(totalBidAmount.toFixed(2))

                            try {
                                // Get the first winning lot number to generate order number
                                const firstWinningLotNumber = formattedWinningLots[0].lot_number
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

                                const orderData = {
                                    order_number: orderNumber, // Corrected this line
                                    seller_email: auctionData.seller_email,
                                    email_address: buyerInformation.email_address,
                                    name: buyerInformation.first_name,
                                    auction_id: auctionData._id.toString(),
                                    auction_image: auctionImage,
                                    auction_title: auctionData.title,
                                    currency: auctionData.currency,
                                    lots: formattedWinningLots.map((lot) => lot.lot_number),
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
                                )

                                // Check if payment request email has already been sent for this order
                                const existingOrder = await mongodbHelper.getOrder(
                                    process.env.MONGO_CLIENT,
                                    process.env.DATABASE,
                                    process.env.ORDERS_COLLECTION,
                                    { order_number: orderNumber },
                                )

                                if (existingOrder && existingOrder.payment_email_sent) {
                                    console.log(`Payment request email already sent for order number: ${orderNumber}. Skipping.`)
                                } else {
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

                                    const subdomainQuery = {
                                        seller_email: auctionData.seller_email,
                                    }
                                    const auctionRedirectionURL = await mongodbHelper.getSubdomain(subdomainQuery, SubDomain)
                                    const auctionIdString = auctionData._id.toString()
                                    const checkoutURL = `https://${auctionRedirectionURL.subdomain}.${process.env.AMPLIFY_DOMAIN_NAME}/auctions/${auctionIdString}/checkout`

                                    const template_data = {
                                        winning_lot: formattedWinningLots.sort((a, b) => a.lot_number - b.lot_number),
                                        winning_lot_count: formattedWinningLots.length,
                                        buyer: buyerInformation.first_name === '' ? 'Customer' : `${buyerInformation.first_name} ${buyerInformation.last_name}`,
                                        title: auctionData.title,
                                        logo_url: auctionData.logo_image === '' ? `${process.env.S3_BUCKET_URL}Logo.png` : `${process.env.S3_BUCKET_URL}${auctionData.logo_image}`,
                                        not_winning_lot: [], // No non-winning lots in this consolidated email
                                        not_winning_lot_count: 0,
                                        seller_name: sellerInformation[0].first_name === '' ? 'User' : `${sellerInformation[0].first_name} ${sellerInformation[0].last_name}`,
                                        seller_email: auctionData.seller_email,
                                        subject: 'Congratulations | Payment Request', // Consolidated email subject
                                        paymentContent: 'Please follow the link below to complete your payment.', // Consolidated payment content
                                        seller_id: sellerInformation[0]._id,
                                        total_amount: formatCurrency(orderAmount, currencyCode),
                                        checkout_url: checkoutURL,
                                    }

                                    promiseList.push(sendTemplateEmails(buyerInformation.email_address, template_data))

                                    // Update the order record to mark email as sent
                                    await mongodbHelper.updateOrder(
                                        process.env.MONGO_CLIENT,
                                        process.env.DATABASE,
                                        process.env.ORDERS_COLLECTION,
                                        { order_number: orderNumber },
                                        { $set: { payment_email_sent: true } },
                                    )
                                }
                            } catch (error) {
                                console.error('Error processing bidder winning lots:', error)
                                // Do not re-throw here, allow processing of other bidders to continue
                            }
                        }
                    }
                }
            }
        }

        // Run all the email sending promises in parallel
        await Promise.all(promiseList)

        // Update the auction status to 'Completed' in MongoDB after all emails have been sent
        // Check if auctionData is defined before attempting to update
        if (auctionData) {
            await mongodbHelper.update(Auction, auctionData._id, { status: 'Completed' })
        } else {
            console.warn('auctionData is not defined. Cannot update auction status.')
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Consolidated payment request emails sent successfully' }),
        }
    } catch (err) {
        console.error('Error in sqsTriggerFunction:', err)
        throw err // Re-throw the error to be caught by the Step Function
    }
}
