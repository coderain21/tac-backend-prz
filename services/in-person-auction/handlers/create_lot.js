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
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const Counter = require('../entities/Counter')
const helpers = require('../lib/helper')


let connection = null

module.exports.create_lot = async (event) => {
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
        const auctionRecord = await mongoConnection.view(Auction, { seller_email: email, auction_id: auctionId })
        if (!auctionRecord || auctionRecord.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
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
                body: JSON.stringify({ message: 'Please fill all the required fields' }),
            }
        }

        // setting the lot number
        const existingLotCount = await Counter.findOneAndUpdate({
            seller_email: email, auction_id: auctionId, record_type: 'Lots',
        }, { $inc: { starting_sequence: 1 } }, { new: true, upsert: true }).exec()
        // console.log('existingLotCount', existingLotCount)
        const lotNumber = existingLotCount ? existingLotCount.starting_sequence : 1
        request_body.lot_number = lotNumber

        // setting seller email
        request_body.seller_email = email
        try {
            // console.log('request_body', request_body)
            const lot = await mongoConnection.save(request_body, Lot)
            const auctionUpdateData = {}
            if (auctionRecord[0] && typeof auctionRecord[0].total_lots === 'number') {
                auctionUpdateData.$inc = { total_lots: 1 }
            } else {
                auctionUpdateData.$set = { total_lots: 1 }
            }
            console.log('auctiondata', auctionRecord)
            if (auctionRecord[0].template_name === 'Single Lot') {
                auctionUpdateData.$set = { auction_image: [request_body.images[0]] }
            }
            const result = await mongoConnection.UpdateAuction(Auction, { seller_email: email, auction_id: auctionId }, auctionUpdateData)
            // console.log('result', result)

            // console.log('lot', lot)
            if (lot) {
                return {
                    statusCode: 201,
                    headers: await helpers.getHeaders(),
                    body: JSON.stringify({ message: 'Lot created successfully' }),
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
        return {
            statusCode: 400,
            headers: await helpers.getHeaders(),
            message: JSON.stringify({ message: 'Something went wrong. Please try again!' }),
        }
    } catch (error) {
        console.log('Error', error)
        return {
            headers: await helpers.getHeaders(),
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
