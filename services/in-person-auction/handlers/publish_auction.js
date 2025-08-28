/* eslint-disable no-await-in-loop */
/* eslint-disable no-multiple-empty-lines */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const mongoConnection = require('../lib/mongodb_helper')
const Auction = require('../entities/Auction')
const User = require('../entities/Users')
const Lot = require('../entities/Lot')
const helpers = require('../lib/helper')


let connection = null

async function hasImagesForAuctionAndSeller(auctionId, sellerEmail) {
    try {
        const pipeline = [
            {
                $match: {
                    auction_id: auctionId,
                    seller_email: sellerEmail,
                },
            },
            {
                $redact: {
                    $cond: {
                        if: { $eq: [{ $size: '$images' }, 0] },
                        then: '$$PRUNE',
                        else: '$$KEEP',
                    },
                },
            },
            { $limit: 1 },
        ]

        const result = await Lot.aggregate(pipeline)
        return result.length > 0 // true if at least one lot has images
    } catch (err) {
        console.error('Error in hasImagesForAuctionAndSeller:', err)
        throw err
    }
}


module.exports.publish_auction = async (event) => {
    // --- Authorization Check ---
    try {
        const { claims } = event.requestContext.authorizer
        if (!claims || !claims['cognito:username']) {
            throw new Error('Unauthorized')
        }
        // You can add group checks here if needed
    } catch (error) {
        return {
            statusCode: 403,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
        }
    }
    // --- End Authorization Check ---

    try {
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        const request_body = JSON.parse(event.body)

        if (!request_body) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Invalid request body' }),
            }
        }
        if (!request_body.auction_id || !request_body.seller_email) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Please provide auction_id and seller_email' }),
            }
        }


        const email = event.requestContext.authorizer.claims['cognito:username']
        if (email !== request_body.seller_email) {
            return {
                statusCode: 403,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }

        const { auction_id } = request_body
        const sellerDetails = await mongoConnection.view(User, { email_address: email })
        console.log('sellerDetails', sellerDetails[0])
        console.log('sellerDetails', sellerDetails[0].stripe_status, sellerDetails[0].paypal_status)
        if (!sellerDetails) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Seller not found' }),
            }
        }
        if (sellerDetails[0].status !== 'Active') {
            console.log('sellerDetails.status', sellerDetails.status)
            return {
                statusCode: 403,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }
        console.log('sellerDetails', sellerDetails[0].stripe_status, sellerDetails[0].paypal_status)
        if (
            (sellerDetails[0].stripe_status === undefined || sellerDetails[0].stripe_status === 'disconnected')
                && (sellerDetails[0].paypal_status === undefined || sellerDetails[0].paypal_status === 'disconnected')
        ) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Stripe or PayPal account is not linked.' }),
            }
        }

        // console.log('email', email)
        const query = { auction_id, seller_email: email }
        // console.log('query', query)
        const auctionDetails = await Auction.findOne({ auction_id, seller_email: email })
        // console.log('auctionDetails', auctionDetails)
        if (!auctionDetails) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }
        if (auctionDetails.status !== 'Draft') {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not in draft state' }),
            }
        }
        if (auctionDetails.start_date < Math.floor(Date.now())) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction cannot be published with the start date in the past' }),
            }
        }
        required_fields = ['auction_image', 'title', 'description', 'currency',
            'time_zone', 'registration_type']
        // eslint-disable-next-line no-restricted-syntax
        for (const field of required_fields) {
            if (!auctionDetails[field]) {
                return {
                    statusCode: 400,
                    headers: await helpers.getHeaders(),
                    body: JSON.stringify({ message: 'required and cannot be empty.' }),
                }
            }
        }
        if (auctionDetails.make_your_auction_private === true && auctionDetails.passcode === '') {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'required and cannot be empty.' }),
            }
        }
        const hasImages = await hasImagesForAuctionAndSeller(auction_id, email)
        if (!hasImages) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'No images found for this auction' }),
            }
        }


        try {
            // console.log('request_body', request_body)
            const updatePayload = {
                status: 'Published',
            }
            const updatedAuction = await Auction.updateOne({ auction_id, seller_email: email }, { $set: updatePayload })
            // console.log('updatedAuction', updatedAuction)
            return {
                statusCode: 204,
                headers: await helpers.getHeaders(),
            }
        } catch (error) {
            console.log('Error while updating to db', error)
            return {
                headers: await helpers.getHeaders(),
                statusCode: 500,
                body: JSON.stringify({
                    message: 'Internal Server Error',
                }),
            }
        }
    } catch (error) {
        console.log('Internal Server Error', error)
        return {
            headers: await helpers.getHeaders(),
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
