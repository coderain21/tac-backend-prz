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
const { request } = require('express')
const mongoConnection = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
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
        const auction = await mongoConnection.view(Auction, { seller_email: email, auction_id: auctionId })
        if (!auction) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }
        const requiredFields = [
            'image',
            'title1',
            'description',
            'reserve',
        ]

        const missingFields = requiredFields.filter((field) => !request_body[field])
        if (missingFields.length > 0) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: 'Please fill all the required fields',
            }
        }

        // setting the lot number
        const existingLotCount = await Counter.findOneAndUpdate({ seller_email: email, record_type: 'Lots', status: 'Active' }, { $inc: { starting_sequence: 1 } }, { new: true, upsert: true }).exec()
        const lotNumber = existingLotCount ? existingLotCount.starting_sequence : 1
        request_body.lot_number = lotNumber

        // setting seller email
        request_body.seller_email = email
        try {
            const lot = await mongoConnection.save(request_body, Lot)
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
