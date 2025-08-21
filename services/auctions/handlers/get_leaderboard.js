/* eslint-disable no-multiple-empty-lines */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const Joi = require('joi')
const mongoConnection = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
const Auction = require('../entities/Auction')
const Counter = require('../entities/Counter')
const helpers = require('../lib/helper')
// const AccessLogs = require('../entities/AccessLogs')

let connection = null

/* The `get_leaderboard` function retrieves auction details (projection only)
   for a given seller and auction_id. */
module.exports.get_leaderboard = async (event) => {
    try {
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
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        console.log('event', event)
        // ✅ Initialize request_body properly
        const request_body = {
            auction_id: event?.pathParameters?.auction_id,
        }
        console.log('request_body', request_body)

        if (!request_body.auction_id) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Invalid request' }),
            }
        }

        const email = event?.requestContext?.authorizer?.claims?.['cognito:username']
        if (!email) {
            return {
                statusCode: 401,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Unauthorized: missing email' }),
            }
        }

        request_body.seller_email = email

        // check if user exists
        const get_user = await mongoConnection.view(Users, { email_address: email })
        if (!get_user || get_user.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'User not found' }),
            }
        }

        const projection = {
            auction_id: 1,
            seller_email: 1,
            event_display: 1,
        }

        const auctionData = await mongoConnection.getAuctionprojection(
            { auction_id: request_body.auction_id, seller_email: email },
            Auction,
            projection,
        )
        console.log('auctionData', auctionData)

        if (!auctionData || auctionData.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }

        // const response = auctionData[0]?._doc || auctionData[0].toObject?.() || auctionData[0]

        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify(auctionData),
        }
    } catch (error) {
        console.log('err', error)
        return {
            headers: await helpers.getHeaders(),
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
                error: error.message,
            }),
        }
    }
}
