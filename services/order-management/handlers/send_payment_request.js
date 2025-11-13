/* eslint-disable no-console */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
const { ObjectId } = require('mongodb')
const mongodbHelper = require('../../lib/mongodb_helper')
const { sendPaymentRequestEmail } = require('../../lib/mailchimp_helper')
const Users = require('../../entities/Users')
const Buyers = require('../../entities/Buyers')
const Auction = require('../../entities/Auction')
const SubDomain = require('../../entities/SubDomain')

let connection = null

/**
 * Send payment request email to a buyer for a specific order
 *
 * Expected request body:
 * {
 *   "order_id": "order_id_string",
 *   "email_address": "buyer@example.com" (optional, will use order email if not provided)
 * }
 */
module.exports.send_payment_request = async (event) => {
    try {
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': '*',
        }

        // Parse request body
        if (!event.body) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Request body is required' }),
            }
        }

        const body = JSON.parse(event.body)
        const { order_id, email_address } = body

        if (!order_id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'order_id is required' }),
            }
        }

        // Connect to MongoDB
        if (connection === null || !connection.readyState) {
            connection = await mongodbHelper.connect()
        }

        // Get order details
        let order
        try {
            order = await mongodbHelper.getOrder(
                process.env.MONGO_CLIENT,
                process.env.DATABASE,
                process.env.ORDERS_COLLECTION,
                { _id: ObjectId(order_id) },
            )
        } catch (err) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Invalid order_id format' }),
            }
        }

        if (!order) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: 'Order not found' }),
            }
        }

        // Use provided email or order email
        const buyer_email = email_address || order.email_address
        if (!buyer_email) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Email address is required' }),
            }
        }

        // Get buyer information
        const buyerQuery = {
            email_address: buyer_email,
            seller_email: order.seller_email,
        }
        const buyer = await mongodbHelper.getUser(buyerQuery, Buyers)

        if (!buyer || buyer.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: 'Buyer not found' }),
            }
        }

        const buyerInformation = Array.isArray(buyer) ? buyer[0] : buyer

        // Get seller information
        const sellerQuery = {
            email_address: order.seller_email,
        }
        const seller = await mongodbHelper.getUser(sellerQuery, Users)

        if (!seller || seller.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: 'Seller not found' }),
            }
        }

        const sellerInformation = Array.isArray(seller) ? seller[0] : seller

        // Get auction information
        const auctionQuery = {
            _id: ObjectId(order.auction_id),
        }
        const auctionData = await mongodbHelper.getAuction(auctionQuery, Auction)

        if (!auctionData) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }

        // Get subdomain for checkout URL
        const subdomainQuery = {
            seller_email: order.seller_email,
        }
        const auctionRedirectionURL = await mongodbHelper.getSubdomain(subdomainQuery, SubDomain)

        // Build checkout URL
        const auctionId = order.auction_id.toString()
        let checkoutURL
        if (auctionRedirectionURL && auctionRedirectionURL.subdomain) {
            checkoutURL = `https://${auctionRedirectionURL.subdomain}.${process.env.AMPLIFY_DOMAIN_NAME || 'indy.auction'}/auctions/${auctionId}/checkout`
        } else {
            checkoutURL = `https://${process.env.AMPLIFY_DOMAIN_NAME || 'indy.auction'}/auctions/${auctionId}/checkout`
        }

        // Prepare buyer name
        let buyerName = 'Customer'
        if (buyerInformation.first_name || buyerInformation.last_name) {
            buyerName = `${buyerInformation.first_name || ''} ${buyerInformation.last_name || ''}`.trim()
        }

        // Prepare seller name
        let sellerName = 'User'
        if (sellerInformation.first_name || sellerInformation.last_name) {
            sellerName = `${sellerInformation.first_name || ''} ${sellerInformation.last_name || ''}`.trim()
        }

        // Get logo URL
        let logoUrl = `${process.env.S3_BUCKET_URL || ''}Logo.png`
        if (auctionData.logo_image) {
            logoUrl = `${process.env.S3_BUCKET_URL || ''}${auctionData.logo_image}`
        }

        // Prepare template data
        const template_data = {
            buyer: buyerName,
            title: auctionData.title || '',
            logo_url: logoUrl,
            winning_lot: order.lots || [],
            winning_lot_count: (order.lots || []).length,
            not_winning_lot: [],
            not_winning_lot_count: 0,
            paymentContent: 'Please follow the link below to complete your payment.',
            seller_email: order.seller_email,
            seller_name: sellerName,
            seller_id: sellerInformation._id.toString(),
            subject: 'Payment Request',
            total_amount: order.amount || 0,
            checkout_url: checkoutURL,
        }

        // Send email using Mandrill
        const currencyCode = order.currency || auctionData.currency || 'USD'
        await sendPaymentRequestEmail(buyer_email, template_data, currencyCode)

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Payment request email sent successfully',
                email: buyer_email,
                order_id,
            }),
        }
    } catch (err) {
        console.error('Error sending payment request email:', err)
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Methods': '*',
            },
            body: JSON.stringify({
                message: 'Internal server error',
                error: err.message,
            }),
        }
    }
}
