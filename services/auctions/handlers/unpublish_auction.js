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
const { Lambda } = require('aws-sdk')
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
// async function stopExecutions(executionArn) {
//     console.log('INSIDE STOP: ')
//     const stepFunctions = new StepFunctions()
//     const params = {
//         executionArn,
//         cause: 'User initiated stop',
//     }
//     return new Promise((resolve, reject) => {
//         stepFunctions.stopExecution(params, async (error, data) => {
//             if (error) {
//                 reject(error)
//             }
//             if (data) {
//                 resolve(data)
//             }
//             resolve({ status: false })
//         })
//     })
// }

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
        const auctionDetails = await mongoConnection.view(Auction, { seller_email, auction_id })
        const lambda = new Lambda()

        if (!auctionDetails || auctionDetails.length === 0) {
            return {
                statusCode: 404,
                headers: helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Auction not found',
                }),
            }
        }

        if (seller_email !== auctionDetails[0].seller_email) {
            return {
                statusCode: 401,
                headers: helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Unauthorized',
                }),
            }
        }
        const getAuctionDetails = auctionDetails[0]
        // setting the throttle time based on total number of lots
        const totalLots = getAuctionDetails.total_lots
        let throttle = 2
        if (totalLots < 100) {
            throttle = 1
        } else if (totalLots >= 100 && totalLots < 200) {
            throttle = 2
        } else {
            throttle = 3
        }

        if (request_body.type === 'UNPUBLISH' && getAuctionDetails.status === 'Published') {
            // Unpublish validation
            // if (getAuctionDetails.publish_session_started_at) {
            //     const now = Math.floor(Date.now() / 1000)
            //     const publishTime = getAuctionDetails.publish_session_started_at
            //     if (now - publishTime < 120) { // 120 seconds = 2 minutes
            //         return {
            //             statusCode: 400,
            //             headers: helpers.getHeaders(),
            //             body: JSON.stringify({
            //                 message: 'Cannot unpublish auction within 2 minutes of publishing.',
            //             }),
            //         }
            //     }
            // }

            try {
                const newStatus = 'Draft'
                const updatePayload = {
                    status: newStatus,
                    unpublish_session_started_at: Math.floor(Date.now() / 1000),
                }
                await mongoConnection.update(Auction, getAuctionDetails._id.toString(), updatePayload)
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

            // Get only RUNNING step function ARNs
            const getAllArns = await mongoConnection.getAllExecutionArn({
                seller_email,
                auction_id,
                $or: [
                    { status: 'RUNNING' },
                    { status: { $exists: false } },
                ],
            }, StepFunctionArn)

            if (getAllArns && getAllArns.length > 0) {
                console.log(`Found ${getAllArns.length} running step functions. Fanning out cleanup tasks.`)

                const batchSize = 100 // Process 100 ARNs per Lambda invocation
                for (let i = 0; i < getAllArns.length; i += batchSize) {
                    const batch = getAllArns.slice(i, i + batchSize)

                    const payload = {
                        arnRecords: batch,
                        seller_email,
                        auction_id,
                        operation_type: 'UNPUBLISH',
                    }

                    try {
                        // eslint-disable-next-line no-await-in-loop
                        await lambda.invoke({
                            FunctionName: `auctions-${process.env.STAGE}-cleanupStepFunctions`,
                            InvocationType: 'Event', // Async invocation
                            Payload: JSON.stringify(payload),
                        }).promise()

                        console.log(`✅ Invoked cleanup task for batch of ${batch.length} ARNs.`)
                    } catch (error) {
                        console.error('❌ Failed to invoke cleanup task for a batch:', error)
                        // Log the error but continue to the next batch
                    }
                }
            }

            // Update lot statuses to ABORTED
            const runningLots = await mongoConnection.view(Lot, { auction_id, status: 'RUNNING' })
            // eslint-disable-next-line no-restricted-syntax
            for (const lot of runningLots) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    await mongoConnection.update(Lot, lot._id.toString(), { status: 'ABORTED' })
                } catch (error) {
                    console.error(`Failed to update lot ${lot._id} status:`, error.message)
                }
            }

            const payload = { auction: { _id: getAuctionDetails._id } }
            const headersList = {
                Accept: '*/*',
                'User-Agent': 'API TEST',
                'Content-Type': 'application/json',
            }
            const reqUrl = `${process.env.SOCKET_URL}/cancelled`
            try {
                const options = await axios({
                    method: 'POST',
                    url: reqUrl,
                    headers: headersList,
                    data: payload,
                })
                console.log('✅ Notification sent successfully. Response:', options.status)
            } catch (notificationError) {
                console.error('❌ Failed to send notification:', notificationError.message)
                // Don't fail the entire operation if notification fails
            }

            // await mongoConnection.update(Auction, getAuctionDetails[0]._id.toString(), updatePayload)
            return {
                statusCode: 204,
                headers: helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Successfully Updated',
                }),
            }
        }
        if (request_body.type === 'CANCEL' && getAuctionDetails.status === 'Accepting bids') {
            await mongoConnection.update(Auction, getAuctionDetails._id.toString(), { status: 'Cancelled' })

            // Get only RUNNING step function ARNs
            const getAllArns = await mongoConnection.getAllExecutionArn({
                seller_email,
                auction_id,
                status: 'RUNNING' || '',
            }, StepFunctionArn)

            // if (getAllArns && getAllArns.length > 0) {
            //     console.log(`Found ${getAllArns.length} step functions - invoking cleanup lambda`)

            //     const payload = {
            //         arnRecords: getAllArns,
            //         seller_email,
            //         auction_id,
            //         operation_type: 'UNPUBLISH', // or 'CANCEL' depending on which block
            //     }

            //     try {
            //         await lambda.invoke({
            //             FunctionName: process.env.CLEANUP_LAMBDA_NAME,
            //             InvocationType: 'Event', // Async invocation
            //             Payload: JSON.stringify(payload),
            //         }).promise()

            //         console.log(`✅ Cleanup lambda invoked for ${getAllArns.length} step functions`)
            //     } catch (error) {
            //         console.error('Failed to invoke cleanup lambda:', error)
            //         // Don't fail the main operation
            //     }

            //     // Immediately update ARN statuses to STOPPING
            //     for (const record of getAllArns) {
            //         try {
            //             await mongoConnection.update(StepFunctionArn, record._id.toString(), {
            //                 status: 'STOPPING',
            //                 stopping_started_at: Math.floor(Date.now() / 1000),
            //             })
            //         } catch (error) {
            //             console.error(`Failed to update ARN record ${record._id}:`, error.message)
            //         }
            //     }
            // }

            if (getAllArns && getAllArns.length > 0) {
                console.log(`Found ${getAllArns.length} running step functions. Fanning out cleanup tasks.`)

                const batchSize = 100 // Process 100 ARNs per Lambda invocation
                for (let i = 0; i < getAllArns.length; i += batchSize) {
                    const batch = getAllArns.slice(i, i + batchSize)

                    const payload = {
                        arnRecords: batch,
                        seller_email,
                        auction_id,
                        operation_type: 'CANCEL',
                    }

                    try {
                        // eslint-disable-next-line no-await-in-loop
                        await lambda.invoke({
                            FunctionName: `auctions-${process.env.STAGE}-cleanupStepFunctions`,
                            InvocationType: 'Event', // Async invocation
                            Payload: JSON.stringify(payload),
                        }).promise()

                        console.log(`✅ Invoked cleanup task for batch of ${batch.length} ARNs.`)
                    } catch (error) {
                        console.error('❌ Failed to invoke cleanup task for a batch:', error)
                        // Log the error but continue to the next batch
                    }
                }
            }

            // Update lot statuses to ABORTED (RUNNING and PENDING)
            const runningLots = await mongoConnection.view(Lot, { auction_id, status: { $in: ['RUNNING', 'PENDING'] } })
            console.log(`Found ${runningLots.length} lots to update to ABORTED status`)

            // eslint-disable-next-line no-restricted-syntax
            for (const lot of runningLots) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    await mongoConnection.update(Lot, lot._id.toString(), { status: 'ABORTED' })
                } catch (error) {
                    console.error(`Failed to update lot ${lot._id} status:`, error.message)
                }
            }

            const payload = { auction: { _id: getAuctionDetails._id } }
            const headersList = {
                Accept: '*/*',
                'User-Agent': 'API TEST',
                'Content-Type': 'application/json',
            }
            const reqUrl = `${process.env.SOCKET_URL}/cancelled`
            try {
                const options = await axios({
                    method: 'POST',
                    url: reqUrl,
                    headers: headersList,
                    data: payload,
                })
                console.log('✅ Notification sent successfully. Response:', options.status)
            } catch (notificationError) {
                console.error('❌ Failed to send notification:', notificationError.message)
                // Don't fail the entire operation if notification fails
            }

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
        console.log('Handler error:', error)
        return {
            statusCode: 500,
            headers: helpers.getHeaders(),
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
