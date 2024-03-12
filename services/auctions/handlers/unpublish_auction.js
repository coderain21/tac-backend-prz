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
 * The function `stopExecutions` asynchronously stops a Step Functions execution with a specified ARN
 * and returns a promise.
 * @param executionArn - The `executionArn` parameter in the `stopExecutions` function is the Amazon
 * Resource Name (ARN) of the Step Functions execution that you want to stop. This ARN uniquely
 * identifies the execution within Step Functions and is used to reference and manipulate the
 * execution.
 * @returns The `stopExecutions` function is returning a Promise. The function makes a call to the
 * `stepFunctions.stopExecution` method with the provided `executionArn` and a cause of 'User initiated
 * stop'. Inside the Promise, it resolves with the `data` if the operation is successful, rejects with
 * the `error` if there is an error, and if neither `data` nor `error
 */
async function stopExecutions(executionArn) {
    console.log('INSIDE STOP: ', executionArn)
    const stepFunctions = new StepFunctions()
    const params = {
        executionArn,
        cause: 'User initiated stop',
    }
    return new Promise((resolve, reject) => {
        stepFunctions.stopExecution(params, async (error, data) => {
            console.log('errr', error, data)
            if (error) {
                reject(error)
            }
            if (data) {
                resolve(data)
            }
            resolve({ status: false })
        })
    })
}

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
        const request_body = JSON.parse(event.body)
        const seller_email = event.requestContext.authorizer.claims['cognito:username']
        const auction_id = decodeURIComponent(event.pathParameters.auction_id)
        const getAuctionDetails = await mongoConnection.view(Auction, { seller_email, auction_id })
        if (seller_email !== getAuctionDetails[0].seller_email) {
            return {
                statusCode: 401,
                headers: await helpers.getHeaders(),
                message: 'Unauthorized',
            }
        }
        if (request_body.type === 'UNPUBLISH' && getAuctionDetails[0].status === 'Accepting bids') {
            await mongoConnection.update(Auction, getAuctionDetails[0]._id.toString(), { status: 'Draft' })
            const stepFunctionEnd = []
            const getAllArns = await mongoConnection.getAllExecutionArn({ seller_email, auction_id }, StepFunctionArn)
            for (const item of getAllArns) {
                const executionArn = item.arn
                stepFunctionEnd.push(stopExecutions(executionArn))
            }
            await Promise.all(stepFunctionEnd)
            return {
                statusCode: 204,
                headers: await helpers.getHeaders(),
                message: 'Successfully updated',
            }
        }

        return {
            statusCode: 400,
            headers: await helpers.getHeaders(),
            message: JSON.stringify({
                message: 'Update Error | Auction status not in the Accepting Bid state',
            }),
        }
    } catch (error) {
        console.log(error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
