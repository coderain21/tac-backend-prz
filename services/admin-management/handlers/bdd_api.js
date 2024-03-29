/* eslint-disable no-restricted-syntax */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const Joi = require('joi')
const { StepFunctions, config } = require('aws-sdk')

const mongoConnection = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const helpers = require('../lib/helper')
const StepFunctionArn = require('../entities/stepFunctionArn')

config.update({ region: 'eu-west-2' })

mongoConnection.connect()

/**
 * Unpublish Auction | Seller unpublish auction
 * @description - API to update auction status to draft if unpublished
 * @route - PATCH /{auction_id}
 * @access - (Private)
 * @user - IndyAuction Seller
 * @returns {Object} (201) - Updated SUccessfully
 * @returns {Error} (500) - There was an error while updating auction status
 */

module.exports.handler = async (event) => {
    try {
        // const seller_email = event.requestContext.authorizer.claims['cognito:username']
        const auction_id = decodeURIComponent(event.pathParameters.auction_id)
        const { seller_email } = event.queryStringParameters
        const getAuctionDetails = await mongoConnection.view(Auction, { seller_email, auction_id })
        await mongoConnection.update(Auction, getAuctionDetails[0]._id.toString(), { status: 'Accepting bids' })
        return {
            statusCode: 204,
            headers: helpers.getHeaders(),
            body: JSON.stringify({
                message: 'Successfully Updated',
            }),
        }
    } catch (error) {
        console.log(error)
        return {
            statusCode: 500,
            headers: helpers.getHeaders(),
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
