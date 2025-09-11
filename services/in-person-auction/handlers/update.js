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

module.exports.update_auction = async (event) => {
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
        const auction_id = decodeURIComponent(event.pathParameters.auction_id)
        if (!auction_id) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction ID is required' }),
            }
        }
        const request_body = JSON.parse(event.body)

        // safety checks
        if (request_body.status || request_body.auction_type) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Status and Auction Type cannot be updated' }),
            }
        }
        const email = event.requestContext.authorizer.claims['cognito:username']
        // console.log('email', email)
        const query = { auction_id, seller_email: email }
        // console.log('query', query)
        const auctionDetails = await mongoConnection.view(Auction, { auction_id, seller_email: email })
        // console.log('auctionDetails', auctionDetails)
        if (!auctionDetails || auctionDetails.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }
        if (auctionDetails[0].start_date < Math.floor(Date.now()) && auctionDetails[0].status !== 'Draft') {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction has already started' }),
            }
        }
        if (auctionDetails[0].status === 'In Progress' || auctionDetails[0].status === 'Completed') {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction is in progress or completed' }),
            }
        }
        // for published auction these fields cant be edited
        const notUpdateAbleFields = ['currency', 'add_buyer_fees', 'fees', 'percentage', 'terms_and_conditions', 'registration_type']
        // console.log('notUpdateAbleFields', notUpdateAbleFields)
        if (auctionDetails[0].status === 'Published') {
            const requestedFields = Object.keys(request_body)
            const invalidField = requestedFields.find((field) => notUpdateAbleFields.includes(field))

            if (invalidField) {
                return {
                    statusCode: 400,
                    headers: await helpers.getHeaders(),
                    body: JSON.stringify({
                        message: `Cannot update field '${invalidField}' for a published auction.`,
                    }),
                }
            }
        }
        try {
            // console.log('request_body', request_body)
            const updatedAuction = await Auction.updateOne({ auction_id, seller_email: email }, { $set: request_body })
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
