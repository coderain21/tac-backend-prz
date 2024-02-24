/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const mongoConnection = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
const cognitoHelper = require('../lib/cognito_helper')
const Auction = require('../entities/Auction')

let body
const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
}

let connection

/* This code exports a function called `updateUserInformation` that is used to update a user's
information in a MongoDB database. The function takes an `event` parameter, which is likely an HTTP
request object that contains information about the request, such as the request body and path
parameters. */
module.exports.updateUserInformation = async (event) => {
    try {
        const request_body = JSON.parse(event.body)
        const email = decodeURIComponent(event.pathParameters.email)
        const keys = Object.keys(request_body)
        connection = await mongoConnection.connect()
        if (keys.length === 0) {
            body = JSON.stringify({
                message: 'Please pass atleast one field',
            })
            return {
                headers,
                statusCode: 400,
                body,
            }
        }
        const get_user = await mongoConnection.view(Users, { email_address: email })
        if (request_body.business_registration_number) {
            const business_name = await mongoConnection.view(Users, { business_registration_number: request_body.business_registration_number })
            if (business_name.length > 0 && business_name[0].email_address !== email) {
                body = JSON.stringify({
                    success_status: false,
                    message: 'Already Exists',
                })
                return {
                    headers,
                    statusCode: 409,
                    body,
                }
            }
        }
        if (get_user !== null) {
            const user_id = get_user[0]._id
            if (request_body.first_name || request_body.last_name) {
                const filter = { seller_email: email }
                const user = get_user[0]
                if (request_body.first_name && request_body.last_name) {
                    request_body.first_name = request_body.first_name || user.first_name
                    request_body.last_name = request_body.last_name || user.last_name
                } else if (request_body.first_name) {
                    request_body.last_name = user.last_name
                } else if (request_body.last_name) {
                    request_body.first_name = user.first_name
                }
                const update = { $set: { seller_name: `${request_body.first_name} ${request_body.last_name}` } }
                const updateResult = await Auction.updateMany(filter, update)
                console.log(updateResult, 'updateResult')
            }
            const update_user_information = await mongoConnection.update(Users, user_id, request_body)
            if (update_user_information.acknowledged) {
                await cognitoHelper.cognitoUpdate(request_body, email)
                body = JSON.stringify({
                    success_status: true,
                    message: 'Changes saved successfully',
                })
                return {
                    headers,
                    statusCode: 204,
                    body,
                }
            }
            body = JSON.stringify({
                message: 'Failed to update information',
            })

            return {
                headers,
                statusCode: 400,
                body,
            }
        }

        body = JSON.stringify({
            message: 'User not found',
        })
        return {
            headers,
            statusCode: 404,
            body,
        }
    } catch (error) {
        console.log(error)
        body = JSON.stringify({
            message: 'Failed to update information',
        })
        return {
            headers,
            statusCode: 400,
            body,
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
