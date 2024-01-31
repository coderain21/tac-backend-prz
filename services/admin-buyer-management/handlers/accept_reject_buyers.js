/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */
const { ObjectId } = require('mongodb')

const Joi = require('joi')

const helpers = require('../lib/helper')
const RegisteredUser = require('../entities/RegisteredUser')

const mongodbHelper = require('../lib/mongodb_helper')

const schema = Joi.object().keys({
    status: Joi.string().required().messages({
        'string.empty': 'please pass the value for status',
        'string.base': 'status should be of type string',
        'any.required': 'status is a required field',
    }),
})

let body

let connection
/**
 * List Bidders | Admin Accept and Reject the Buyers
 * @description - API to accept or reject the buyers
 * @route - GET /{buyer_id}
 * @access - (Private)
 * @user - IndyAuction Admin
 * @returns {Object} (200) - Accept and Reject the Buyers
 * @returns {Error} (500) - There was an error while updating the buyers
 */
module.exports.handler = async (event) => {
    try {
        /** Establish database connection */
        connection = await mongodbHelper.connect()
        const buyerId = decodeURIComponent(event.pathParameters.buyer_id)
        const requestBody = JSON.parse(event.body)
        const validationResult = schema.validate(requestBody)
        if (validationResult.error) {
            const errorMessage = (validationResult.error.details[0].type === 'object.unknown') ? 'Please pass valid Information' : validationResult.error.message
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: errorMessage }),
            }
        }
        const query = { _id: new ObjectId(buyerId) }
        const updateStatus = await mongodbHelper.commonUpdate(RegisteredUser, query, requestBody)
        if (updateStatus.acknowledged) {
            body = JSON.stringify({
                success_status: true,
                message: 'Status updated successfully',
            })
            return {
                headers: await helpers.getHeaders(),
                statusCode: 204,
                body,
            }
        }
        body = JSON.stringify({
            message: 'Please Pass the correct information to update.',
        })
        return {
            headers: await helpers.getHeaders(),
            statusCode: 400,
            body,
        }
    } catch (error) {
        /** Log and handle errors */
        console.error(error)
        return {
            statusCode: 404,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'User not found',
            }),
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
