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
const helpers = require('../lib/helper')

let body
const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
}

/* This code exports a function called `updateUserInformation` that is used to update a user's
information in a MongoDB database. The function takes an `event` parameter, which is likely an HTTP
request object that contains information about the request, such as the request body and path
parameters. */

module.exports.create_auction = async (event) => {
    try {
        const request_body = JSON.parse(event.body)
        const email = 'sandhyashri@7edge.com'
        request_body.seller_email = email
        const connection = await mongoConnection.connect()
        const get_user = await mongoConnection.view(Users, { email_address: email })
        const auction_collection = process.env.TABLE_NAME
        const maxAuction = await Auction.findOne().sort({ sequenceNumberCounter: -1 });

        let nextSequenceNumber = 1;
        console.log('get', maxAuction)
        if (maxAuction && maxAuction.sequenceNumberCounter) {
            nextSequenceNumber = maxAuction.sequenceNumberCounter + 1;
        }

        const formattedNextNumber = nextSequenceNumber.toString().padStart(3, '0');
        const sequenceNumber = `A${formattedNextNumber}`;
        if (get_user.user_type === 'free') {
            if (db.collection(auction_collection).countDocuments({ email_address: email }, options) === 1) {
                return {
                    headers,
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'please upgrade your current subscription',
                    }),
                }
            }
        }
        const auction = await mongoConnection.save(request_body, Auction)
        await connection.disconnect()
        // Continue with your logic if validation passes
        // ...
        return {
            statusCode: 201,
            headers: await helpers.getHeaders(),
        }
    } catch (error) {
        console.log('err', error)
        return {
            headers,
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
