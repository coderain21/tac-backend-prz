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
const Users = require('../entities/Users')
const Lot = require('../entities/Lot')
const helpers = require('../lib/helper')


let connection = null

module.exports.update_lot = async (event) => {
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
        console.log(request_body)
        if (!request_body) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Invalid request body' }),
            }
        }

        if (!request_body.auction_id || !request_body.lot_number) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Invalid request body' }),
            }
        }

        const email = event.requestContext.authorizer.claims['cognito:username']
        request_body.seller_email = email
        const get_user = await mongoConnection.view(Users, { email_address: email })
        if (!get_user) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'User not found' }),
            }
        }
        const auctionId = request_body.auction_id
        const lotRecord = await mongoConnection.view(Lot, { seller_email: email, auction_id: auctionId, lot_number: request_body.lot_number })
        if (!lotRecord || lotRecord.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Lot not found' }),
            }
        }
        const requiredFields = [
            'images',
            'title1',
            'description',
            'reserve',
        ]

        const missingFields = requiredFields.filter((field) => !request_body[field])
        if (missingFields.length > 0) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Please fill the required fields' }),
            }
        }


        // setting seller email
        request_body.seller_email = email
        try {
            const query = { seller_email: email, auction_id: auctionId, lot_number: request_body.lot_number }
            const lot = await mongoConnection.updateLot(Lot, query, request_body)
            // console.log('result', result)

            console.log('lot', lot)
            if (lot) {
                return {
                    statusCode: 204,
                    headers: await helpers.getHeaders(),
                }
            }
        } catch (err) {
            console.log('DB error', err)
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Something went wrong. Please try again!' }),
            }
        }
    } catch (error) {
        console.log('err', error)
        return {
            headers: await helpers.getHeaders(),
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
