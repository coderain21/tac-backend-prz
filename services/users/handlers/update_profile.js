/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const mongoConnection = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
const cognitoHelper = require('../lib/cognito_helper')

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
module.exports.updateUserInformation = async (event) => {
    try {
        const request_body = JSON.parse(event.body)
        const email = decodeURIComponent(event.pathParameters.email)
        const keys = Object.keys(request_body)
        const connection = await mongoConnection.connect()
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
        console.log('get', get_user)
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
            const update_user_information = await mongoConnection.update(Users, user_id, request_body)
            console.log('update_user_information', update_user_information)
            if (update_user_information.acknowledged) {
                const cognitoUpdate = await cognitoHelper.cognitoUpdate(request_body, email)
                console.log('cogni', cognitoUpdate)
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
            await connection.disconnect()

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
    }
}
