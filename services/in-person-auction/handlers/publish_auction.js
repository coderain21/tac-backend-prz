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
const helpers = require('../lib/helper')


let connection = null

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
