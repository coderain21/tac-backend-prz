/* eslint-disable no-restricted-syntax */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
// eslint-disable-next-line import/no-extraneous-dependencies

const mongoConnection = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const helpers = require('../lib/helper')

let connection = null

/**
 * Unpublish Auction | Seller unpublish auction
 * @description - API to update auction status to draft if unpublished
 * @route - PATCH /{auction_id}
 * @access - (Private)
 * @user - IndyAuction Seller
 * @returns {Object} (201) - Updated SUccessfully
 * @returns {Error} (500) - There was an error while updating auction status
 */

module.exports.unpublish_auction = async (event) => {
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
        const seller_email = event.requestContext.authorizer.claims['cognito:username']
        console.log('request_body', request_body)
        console.log('seller_email', seller_email)
        const { auction_id } = request_body
        const email = request_body.seller_email
        if (!email || !auction_id) {
            return {
                statusCode: 400,
                headers: helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Missing required parameters',
                }),
            }
        }
        if (email !== seller_email) {
            return {
                statusCode: 403,
                headers: helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'You do not have access to perform this API action',
                }),
            }
        }
        const getAuctionDetails = await mongoConnection.view(Auction, { seller_email, auction_id })
        console.log('getAuctionDetails', getAuctionDetails)
        if (seller_email !== getAuctionDetails[0].seller_email) {
            return {
                statusCode: 401,
                headers: helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Unauthorized',
                }),
            }
        }

        if (getAuctionDetails[0].status === 'Published') {
            try {
                const newStatus = 'Draft'
                const updatePayload = {
                    status: newStatus,
                    unpublish_session_started_at: Math.floor(Date.now() / 1000),
                }
                await mongoConnection.update(Auction, getAuctionDetails[0]._id.toString(), updatePayload)
            } catch (error) {
                console.log('Error updating auction status:', error)
                return {
                    statusCode: 500,
                    headers: helpers.getHeaders(),
                    body: JSON.stringify({
                        message: 'Internal Server Error',
                    }),
                }
            }

            // await mongoConnection.update(Auction, getAuctionDetails[0]._id.toString(), updatePayload)
            return {
                statusCode: 204,
                headers: helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Successfully Updated',
                }),
            }
        }
        return {
            statusCode: 400,
            headers: helpers.getHeaders(),
            body: JSON.stringify({
                message: 'Update Error | Auction status not in the Published state',
            }),
        }
    } catch (error) {
        console.log(error)
        return {
            statusCode: 500,
            headers: helpers.getHeaders(),
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
