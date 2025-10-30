/* eslint-disable no-restricted-syntax */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */

const mongoConnection = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const helpers = require('../lib/helper')

let connection = null

/**
 * Cancel Auction | Seller cancel auction
 * @description - API to update auction status to cancelled if in progress
 * @route - PATCH /{auction_id}
 * @access - (Private)
 * @user - IndyAuction Seller
 * @returns {Object} (204) - Updated Successfully
 * @returns {Error} (500) - There was an error while updating auction status
 */

module.exports.cancel_auction = async (event) => {
    try {
        // --- Authorization Check ---
        const { claims } = event.requestContext.authorizer
        if (!claims || !claims['cognito:username']) {
            return {
                statusCode: 403,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }

        // --- Ensure MongoDB connection ---
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        // --- Parse request body with error handling ---
        let request_body
        try {
            request_body = JSON.parse(event.body)
        } catch (parseError) {
            console.log('JSON parsing error:', parseError)
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Invalid JSON in request body' }),
            }
        }

        const seller_email = event.requestContext.authorizer.claims['cognito:username']
        const { auction_id } = request_body
        const email = request_body.seller_email

        // --- Validate required parameters ---
        if (!email || !auction_id) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Missing required parameters' }),
            }
        }

        // --- Validate seller email matches authenticated user ---
        if (email !== seller_email) {
            return {
                statusCode: 403,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }

        // --- Check if auction exists and belongs to the seller ---
        const getAuctionDetails = await mongoConnection.view(Auction, { seller_email, auction_id })

        if (!getAuctionDetails || getAuctionDetails.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }

        // --- Additional seller verification (redundant but keeping for consistency) ---
        if (seller_email !== getAuctionDetails[0].seller_email) {
            return {
                statusCode: 401,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Unauthorized' }),
            }
        }

        // --- Check if auction status is 'In Progress' ---
        if (getAuctionDetails[0].status !== 'In Progress') {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Update Error | Auction status not In Progress' }),
            }
        }

        // --- Update auction status to 'Cancelled' ---
        try {
            const newStatus = 'Cancelled'
            const updatePayload = {
                status: newStatus,
                updated_at: new Date(),
            }

            // After update - verify the auction still exists:
            const verifyAuction = await mongoConnection.update(Auction, getAuctionDetails[0]._id.toString(), updatePayload)
            console.log('Auction after update:', verifyAuction)

            return {
                statusCode: 204,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Successfully Updated' }),
            }
        } catch (updateError) {
            console.log('Error updating auction status:', updateError)
            return {
                statusCode: 500,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Internal Server Error' }),
            }
        }
    } catch (error) {
        console.log('Error:', error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'Internal Server Error' }),
        }
    }
}
