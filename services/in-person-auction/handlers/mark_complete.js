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
const Auction = require('../entities/Auction')
const helpers = require('../lib/helper')


let connection = null

module.exports.mark_complete = async (event) => {
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
            headers: helpers.getHeaders(),
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
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Invalid request body' }),
            }
        }
        const { auction_id } = request_body
        const { status } = request_body
        if (!auction_id || !status) {
            return {
                statusCode: 400,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction ID and Status are required' }),
            }
        }

        const email = event.requestContext.authorizer.claims['cognito:username']
        // console.log('email', email)
        // const query = { auction_id, seller_email: email }
        // // console.log('query', query)
        const auctionDetails = await Auction.findOne({ auction_id, seller_email: email })
        // console.log('auctionDetails', auctionDetails)
        if (!auctionDetails) {
            return {
                statusCode: 404,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }
        if (auctionDetails.status === 'Draft' || auctionDetails.status === 'Completed' || auctionDetails.status === 'Cancelled') {
            return {
                statusCode: 400,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Cannot complete a draft or completed auction or cancelled auction' }),
            }
        }
        try {
            // console.log('request_body', request_body)
            const updatePayload = {
                status: 'Completed',
            }
            const updatedAuction = await Auction.updateOne({ auction_id, seller_email: email }, { $set: updatePayload })
            // console.log('updatedAuction', updatedAuction)
            return {
                statusCode: 204,
                headers: helpers.getHeaders(),
            }
        } catch (error) {
            console.log('Error while updating to db', error)
            return {
                headers: helpers.getHeaders(),
                statusCode: 500,
                body: JSON.stringify({
                    message: 'Internal Server Error',
                }),
            }
        }
    } catch (error) {
        console.log('Internal Server Error', error)
        return {
            headers: helpers.getHeaders(),
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
