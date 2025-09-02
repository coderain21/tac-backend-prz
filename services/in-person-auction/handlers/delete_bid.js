/* eslint-disable no-multiple-empty-lines */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const { ObjectId } = require('mongodb')
const helpers = require('../lib/helper')
const mongoConnection = require('../lib/mongodb_helper')
const LiveBid = require('../entities/LiveBid')


let connection = null

module.exports.delete_bid = async (event) => {
    // --- Authorization Check ---
    try {
        const { claims } = event.requestContext.authorizer
        if (!claims || !claims['cognito:username']) {
            throw new Error('Unauthorized')
        }
    } catch (error) {
        return {
            statusCode: 403,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
        }
    }

    try {
        // --- Ensure MongoDB connection ---
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        const { bid_id } = event.pathParameters || {}

        // --- Validate request parameter ---
        if (!bid_id) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Bid ID is required' }),
            }
        }

        const bid = await LiveBid.findOne({ _id: new ObjectId(bid_id) })

        // --- Check if the bid exists in the database ---
        if (!bid) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Bid not found' }),
            }
        }

        // --- Delete the bid based on bid id ---
        try {
            const deleteBid = await LiveBid.findOneAndDelete({ _id: new ObjectId(bid_id) })

            // Return 204 No Content on successful deletion
            return {
                statusCode: 204,
                headers: await helpers.getHeaders(),
            }
        } catch (error) {
            // DB error while deleting bid
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
