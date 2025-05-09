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

let connection = null

/* This code exports a function called `updateUserInformation` that is used to update a user's
information in a MongoDB database. The function takes an `event` parameter, which is likely an HTTP
request object that contains information about the request, such as the request body and path
parameters. */
module.exports.updateUserInformation = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            console.log('not connected')
            connection = await mongoConnection.connect()
        }
        const request_body = JSON.parse(event.body)
        const email = decodeURIComponent(event.pathParameters.email)

        console.log('Request path email:', email)
        console.log('Authorization claims:', JSON.stringify(event.requestContext.authorizer))

        // Authorization check to verify user has permission to update this profile
        try {
            if (!event.requestContext.authorizer || !event.requestContext.authorizer.claims) {
                console.log('Missing authorization claims')
                return {
                    headers,
                    statusCode: 403,
                    body: JSON.stringify({
                        message: 'Authorization failed - missing claims',
                    }),
                }
            }

            const email_address = event.requestContext.authorizer.claims.email
            console.log('Token email:', email_address)

            // Compare emails case-insensitively
            if (email_address.toLowerCase() !== email.toLowerCase()) {
                console.log('Email mismatch:', email_address, email)
                return {
                    headers,
                    statusCode: 403,
                    body: JSON.stringify({
                        message: 'You do not have access to perform this API action',
                    }),
                }
            }
        } catch (error) {
            console.log('Authorization error:', error)
            return {
                headers,
                statusCode: 403,
                body: JSON.stringify({
                    message: 'You do not have access to perform this API action',
                    error: error.message,
                }),
            }
        }

        // restricting the user not to update email address
        if (request_body.email_address && request_body.email_address.toLowerCase() !== email.toLowerCase()) {
            console.log('Email change attempt detected')
            console.log('Requested email:', request_body.email_address)
            console.log('Path email:', email)
            return {
                headers,
                statusCode: 400,
                body: JSON.stringify({
                    message: 'You do not have access to change the email address',
                }),
            }
        }

        const keys = Object.keys(request_body)
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
        if (!get_user || get_user.length === 0) {
            body = JSON.stringify({
                message: 'User not found',
            })
            return {
                headers,
                statusCode: 404,
                body,
            }
        }

        if (request_body.business_registration_number) {
            const business_name = await mongoConnection.view(Users, { business_registration_number: request_body.business_registration_number })
            if (business_name.length > 0 && business_name[0].email_address.toLowerCase() !== email.toLowerCase()) {
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

        const user_id = get_user[0]._id
        if (request_body.first_name || request_body.last_name) {
            const filter = { seller_email: email }
            const user = get_user[0]
            if (request_body.first_name && request_body.last_name) {
                // Both first and last name provided
            } else if (request_body.first_name) {
                request_body.last_name = user.last_name
            } else if (request_body.last_name) {
                request_body.first_name = user.first_name
            }
            const update = { $set: { seller_name: `${request_body.first_name || user.first_name} ${request_body.last_name || user.last_name}` } }
            const updateResult = await Auction.updateMany(filter, update)
            console.log('Auction update result:', updateResult)
        }

        const update_user_information = await mongoConnection.update(Users, user_id, request_body)
        if (update_user_information.acknowledged) {
            try {
                await cognitoHelper.cognitoUpdate(request_body, email)
                console.log('User updated successfully')

                // For successful updates, use 200 OK with body (or 204 with NO body)
                // return {
                //     headers,
                //     statusCode: 200,
                //     body: JSON.stringify({
                //         success_status: true,
                //         message: 'Changes saved successfully',
                //     }),
                // }

                // Alternative: If you want to use 204, don't include a body
                return {
                    headers,
                    statusCode: 204,
                }
            } catch (cognitoError) {
                console.log('Cognito update error:', cognitoError)
                // Database was updated but Cognito failed
                return {
                    headers,
                    statusCode: 207, // Partial success
                    body: JSON.stringify({
                        success_status: true,
                        message: 'Database updated but identity provider sync failed',
                        error: cognitoError.message,
                    }),
                }
            }
        }

        body = JSON.stringify({
            message: 'Failed to update information.',
        })
        return {
            headers,
            statusCode: 400,
            body,
        }
    } catch (error) {
        console.log('General error:', error)
        body = JSON.stringify({
            message: 'Failed to update information',
            error: error.message,
        })
        return {
            headers,
            statusCode: 500, // Changed to 500 for server errors
            body,
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection && connection.disconnect) {
            await connection.disconnect()
        }
    }
}
