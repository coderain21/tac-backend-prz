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
const cognitoHelper = require('../lib/cognito_helper')
const { collection } = require('../../../entities/Auction')

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
        const get_user = await mongoConnection.view(Users, { email_address: email })
        const menu_link = request_body.menulink
        const auction_collection = process.env.AUCTION_MONGODB_COLLECTION_NAME
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
        const connection = await mongoConnection.connect()
        const auction = await mongoConnection.save(request_body, auction_collection)
        await connection.disconnect()
        // Continue with your logic if validation passes
        // ...
        return {
            statusCode: 201,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'Success' }),
        }
    } catch (error) {
        return {
            headers,
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
