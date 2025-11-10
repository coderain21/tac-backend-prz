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
const Users = require('../entities/Users')
const Auction = require('../entities/Auction')
const Counter = require('../entities/Counter')
const helpers = require('../lib/helper')
// const AccessLogs = require('../entities/AccessLogs')

let connection = null

/* The `module.exports.create_auction` function is an asynchronous function that handles the creation
of an auction. It takes an `event` parameter, which is typically an HTTP request event. */
module.exports.create_auction = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }
        const request_body = JSON.parse(event.body)
        const email = event.requestContext.authorizer.claims['cognito:username']
        request_body.seller_email = email
        const get_user = await mongoConnection.view(Users, { email_address: email })
        const counter = await Counter.findOneAndUpdate({ seller_email: email, record_type: 'Auctions', status: 'Active' }, { $inc: { starting_sequence: 1 } }, { new: true, upsert: true }).exec()
        const sequenceNumber = `A${helpers.leftPad(counter.starting_sequence, 4)}`
        request_body.auction_id = sequenceNumber
        request_body.seller_name = `${get_user[0].first_name} ${get_user[0].last_name}`
        request_body.first_lot_end_date = request_body.first_lot_end_date ? request_body.first_lot_end_date : request_body.end_date
        const auction = await mongoConnection.save(request_body, Auction)
        if (auction) {
            /* Start: Saving the Access logs */
            // const accessLog = {
            //     actor_id: get_user[0].seller_id,
            //     updated_by: {
            //         type: 'Seller',
            //         name: request_body.seller_name,
            //         email_address: get_user[0].email_address,
            //     },
            //     section: {
            //         name: 'Auctions Management',
            //         action: 'Create',
            //         auction_id: request_body.auction_id,
            //     },
            // }
            // await mongoConnection.save(accessLog, AccessLogs)
            /* End: Saving the Access logs */

            update_value = {
                auctions_count: helpers.leftPad(counter.starting_sequence, 1),
            }
            await mongoConnection.updateUsingMongoDB(process.env.MONGO_CLIENT, process.env.MONGODB_NAME, process.env.SELLERS_TABLE, get_user[0]._id, update_value)
            return {
                statusCode: 201,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Auction created successfully',
                    auctions_id: sequenceNumber,
                    _id: auction._id,
                    title: auction.title,
                }),
            }
        }
        return {
            statusCode: 400,
            headers: await helpers.getHeaders(),
            message: 'Something went wrong. Please try again!',
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
