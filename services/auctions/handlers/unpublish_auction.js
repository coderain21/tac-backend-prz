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
// eslint-disable-next-line import/no-extraneous-dependencies
const axios = require('axios')

const mongoConnection = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const helpers = require('../lib/helper')
const StepFunctionArn = require('../entities/stepFunctionArn')

config.update({ region: 'eu-west-2' })

let connection = null

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
    console.log('INSIDE STOP: ')
    const stepFunctions = new StepFunctions()
    const params = {
        executionArn,
        cause: 'User initiated stop',
    }
    return new Promise((resolve, reject) => {
        stepFunctions.stopExecution(params, async (error, data) => {
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
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }
        const request_body = JSON.parse(event.body)
        const seller_email = event.requestContext.authorizer.claims['cognito:username']
        const auction_id = decodeURIComponent(event.pathParameters.auction_id)
        const getAuctionDetails = await mongoConnection.view(Auction, { seller_email, auction_id })
        if (seller_email !== getAuctionDetails[0].seller_email) {
            return {
                statusCode: 401,
                headers: helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Unauthorized',
                }),
            }
        }

        // setting the throttle time based on total number of lots
        const totalLots = getAuctionDetails[0].total_lots
        let throttle = 2
        if (totalLots < 100) {
            throttle = 1
        } else if (totalLots >= 100 && totalLots < 200) {
            throttle = 2
        } else {
            throttle = 3
        }

        if (request_body.type === 'UNPUBLISH' && getAuctionDetails[0].status === 'Published') {
            // check if auction is published within 2 minutes
            if (getAuctionDetails[0].publish_session_started_at) {
                const now = Math.floor(Date.now() / 1000)
                const publishTime = getAuctionDetails[0].publish_session_started_at
                if (now - publishTime < (throttle * 60)) { // 120 seconds = 2 minutes
                    return {
                        statusCode: 400,
                        headers: helpers.getHeaders(),
                        body: JSON.stringify({
                            message: `Cannot unpublish auction within ${throttle} minutes of publishing.`,
                        }),
                    }
                }
            }

            try {
                const newStatus = 'Draft'
                const updatePayload = {
                    status: newStatus,
                    unpublish_session_started_at: Math.floor(Date.now() / 1000),
                }
                await mongoConnection.update(Auction, getAuctionDetails[0]._id.toString(), updatePayload)
            } catch (error) {
                console.log('Error updating auction status:', error)
                return {
                    statusCode: 500,
                    headers: helpers.getHeaders(),
                    body: JSON.stringify({
                        message: 'Internal Server Error',
                    }),
                }
            }

            const stepFunctionEnd = []
            const getAllArns = await mongoConnection.getArns({ seller_email, auction_id }, StepFunctionArn)
            for (const item of getAllArns) {
                const executionArn = item.arn
                stepFunctionEnd.push(stopExecutions(executionArn))
            }
            await Promise.all(stepFunctionEnd)
            const status = 'ABORTED'
            const updateArn = await mongoConnection.updateArnStatus({ seller_email, auction_id }, status, StepFunctionArn)

            console.log('updateArnStatus', updateArn)

            await mongoConnection.update(Auction, getAuctionDetails[0]._id.toString(), updatePayload)
            return {
                statusCode: 204,
                headers: helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Successfully Updated',
                }),
            }
        }
        if (request_body.type === 'CANCEL' && getAuctionDetails[0].status === 'Accepting bids') {
            await mongoConnection.update(Auction, getAuctionDetails[0]._id.toString(), { status: 'Cancelled' })
            const stepFunctionEnd = []
            // const getAllArns = await mongoConnection.getAllExecutionArn({ seller_email, auction_id }, StepFunctionArn)
            // new function to get only which is running
            const getAllArns = await mongoConnection.getArns({ seller_email, auction_id }, StepFunctionArn)
            for (const item of getAllArns) {
                const executionArn = item.arn
                stepFunctionEnd.push(stopExecutions(executionArn))
            }
            await Promise.all(stepFunctionEnd)

            const status = 'ABORTED'
            const updateArn = await mongoConnection.updateArnStatus({ seller_email, auction_id }, status, StepFunctionArn)

            console.log('updateArnStatus', updateArn)

            await mongoConnection.update(Auction, getAuctionDetails[0]._id.toString(), updatePayload)

            const payload = { auction: { _id: getAuctionDetails[0]._id } }
            const headersList = {
                Accept: '*/*',
                'User-Agent': 'API TEST',
                'Content-Type': 'application/json',
            }
            const reqUrl = `${process.env.SOCKET_URL}/cancelled`
            const options = await axios({
                method: 'POST',
                url: reqUrl,
                headers: headersList,
                data: payload,
            })
            console.log('✅ Notification sent successfully. Response:', options.status)

            return {
                statusCode: 204,
                headers: helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Successfully Updated',
                }),
            }
        }

        return {
            statusCode: 400,
            headers: helpers.getHeaders(),
            body: JSON.stringify({
                message: request_body.type === 'UNPUBLISH' ? 'Update Error | Auction status not in the Published state' : 'Update Error | Auction status not in the Accepting Bids state',
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
