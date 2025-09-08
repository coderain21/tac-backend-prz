/* eslint-disable no-multiple-empty-lines */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable no-underscore-dangle */
/* eslint-disable consistent-return */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-param-reassign */
/* eslint-disable camelcase */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-undef */
const { StepFunctions, config } = require('aws-sdk')
const request = require('request')
const axios = require('axios')

const mongodbHelper = require('../lib/mongodb_helper')
const StepFunctionArn = require('../entities/stepFunctionArn')
const redisHelper = require('../lib/redis_helper')

let connection = null
const Lot = require('../entities/Lot')

config.update({ region: 'eu-west-2' })

const currentTimeEpoch = Date.now()

/**
 * Starts an execution of the state machine after the auction is published.
 *
 * @param {string} executionARN - The ARN of the state machine
 * @param {Object} lots - The auction lot data
 * @returns {Promise<Object>} - The data returned from the startExecution call
 */
async function startExecutionAfterPublish(executionARN, lots) {
    try {
        const stepfunctions = new StepFunctions()

        // Set the start date to the ISO string, which is required by the state machine
        const newStartDate = new Date(lots.start_date).toISOString()
        lots.start_date = newStartDate

        // Set the parameters for the startExecution call
        const params = {
            stateMachineArn: executionARN,
            input: JSON.stringify(lots),
        }

        return new Promise((resolve, reject) => {
            // Start the execution of the state machine
            stepfunctions.startExecution(params, async (error, data) => {
                if (error) {
                    // If there is an error, reject the promise
                    console.log('error', error)
                    reject(error)
                }
                if (data) {
                    // If there is data, save the execution ARN to the DB and resolve the promise with the data
                    const requestPayload = {
                        arn: data.executionArn,
                        lot_id: lots._id.toString(),
                        auction_id: lots.auction_id,
                        seller_email: lots.seller_email,
                        status: 'RUNNING',
                    }
                    console.log('--- DEBUG: Payload before save ---', JSON.stringify(requestPayload, null, 2))
                    const x = await mongodbHelper.save(requestPayload, StepFunctionArn)
                    console.log('x', x)

                    resolve(data)
                }
                // If there is no data, resolve the promise with an object with a status of false
                resolve({ status: false })
            })
        })
    } catch (err) {
        // Log the error to the console
        console.log('start err', err)
    }
}

/**
 * Start an execution of the state machine for the given execution ARN.
 *
 * @param {string} executionARN - The ARN of the state machine to execute
 * @param {Object} lots - The lots to pass to the state machine
 * @returns {Promise} A promise that resolves with the data from the startExecution call if successful,
 * or rejects with an error
 */
async function startExecution(executionARN, lots) {
    try {
        console.log('execution starteddd')
        const stepfunctions = new StepFunctions()
        const newStartDate = new Date(lots.start_date).toISOString()
        lots.start_date = newStartDate

        const params = {
            stateMachineArn: executionARN,
            input: JSON.stringify(lots),
        }

        return new Promise((resolve, reject) => {
            stepfunctions.startExecution(params, async (error, data) => {
                if (error) {
                    reject(error)
                    return
                }
                if (data) {
                    // Get the execution ARN from MongoDB
                    const getArn = await mongodbHelper.getExecutionArn(lots, StepFunctionArn)
                    // Update the MongoDB record with the execution ARN
                    await mongodbHelper.updateArn(getArn, data, StepFunctionArn)
                    resolve(data)
                    return
                }
                resolve({ status: false })
            })
        })
    } catch (err) {
        console.log('start err', err)
        throw err
    }
}

/**
 * Stops an execution of the state machine for the given execution ARN.
 *
 * @param {string} executionArn - The ARN of the state machine execution to stop
 * @returns {Promise} A promise that resolves with the data from the stopExecution call if successful,
 * or rejects with an error
 */
async function stopExecutions(executionArn) {
    try {
        console.log('INSIDE STOP: ', executionArn)
        const stepFunctions = new StepFunctions()

        // First check the execution status
        const describeParams = { executionArn }
        const description = await stepFunctions.describeExecution(describeParams).promise()

        // Only stop if it's actually running
        if (description.status === 'RUNNING') {
            const params = {
                executionArn,
                cause: 'User initiated stop for update',
            }

            const result = await stepFunctions.stopExecution(params).promise()
            return result
        }
        console.log(`Execution ${executionArn} is already ${description.status}`)
        return { status: 'already_stopped', currentStatus: description.status }
    } catch (err) {
        console.log('Stop execution error:', err)
        throw err
    }
}

/**
 * Stop execution with retry logic
 */
async function stopExecutionWithRetry(executionArn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await stopExecutions(executionArn)
            if (result && result.status !== false) {
                return result
            }
        } catch (error) {
            console.error(`Stop attempt ${i + 1} failed:`, error)
            if (i === maxRetries - 1) throw error
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)))
    }
    throw new Error(`Failed to stop execution after ${maxRetries} attempts`)
}

/**
 * Start execution with retry logic
 */
async function startExecutionWithRetry(executionARN, lots, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await startExecution(executionARN, lots)
            if (result && result.status !== false) {
                return result
            }
        } catch (error) {
            console.error(`Start attempt ${i + 1} failed:`, error)
            if (i === maxRetries - 1) throw error
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)))
    }
    throw new Error(`Failed to start execution after ${maxRetries} attempts`)
}

async function updateRedisData(lotInformation, client) {
    try {
        lotInformation.initial_end_time = lotInformation.end_date
        const lot_id = lotInformation._id.toString()
        const bidKey = `lot:${lot_id}`
        const existingRecord = await client.hget('lot', bidKey)
        const get_lot = JSON.parse(existingRecord)
        const updateRequest = {
            ...get_lot,
            lot_end_date: lotInformation.lot_end_time,
            end_date: lotInformation.end_date,
        }
        updateRequest.winning_user = updateRequest.winning_user || ''
        const updatePromise = client
            .multi()
            .hset('lot', bidKey, JSON.stringify(updateRequest))
            .exec()
        await Promise.all([updatePromise])
        const payload = { lots: updateRequest }
        const headersList = {
            Accept: '*/*',
            'User-Agent': 'API TEST',
            'Content-Type': 'application/json',
        }
        const reqUrl = `${process.env.SOCKET_URL}/notification`
        try {
            const response = await axios({
                method: 'POST',
                url: reqUrl,
                headers: headersList,
                data: payload,
            })
            console.log('✅ Notification sent successfully. Response:', response.status)
            return response
        } catch (error) {
            console.error('❌ Error sending notification:', error)
            throw error
        }
    } catch (err) {
        console.log(err)
    }
}

/**
 * Function to update the time of the lot in redis based on the
 * extension time.
 * @param {Object} auctionLots - Array of auction lots to update in redis
 * @param {Object} client - Redis client object
 * @param {Number} extend_time - Extension time
 */
async function findAndUpdateTime(auctionLots, client, extend_time) {
    try {
        const redisDataUpdate = []
        // Loop through each auction lot
        for (const item of auctionLots) {
            // Update the end date of the lot with the extension time
            item.lot_end_time = item.end_date + extend_time
            // Check if the lot end date is greater than the current date
            if (item.end_date > currentTimeEpoch) {
                // Update the redis data for the lot
                redisDataUpdate.push(updateRedisData(item, client))
            }
        }
        // Run all the redis update promises in parallel
        await Promise.all(redisDataUpdate)
    } catch (err) {
        return err
    }
}

/**
 * AWS Lambda function to handle the batch lots update event
 * received from SQS.
 *
 * This function is triggered by an SQS event when a new event is
 * added to the batch_lots_update queue. It handles the event by
 * updating the time of the lots in Redis based on the extension
 * time specified in the event.
 *
 * The event should have the following attributes:
 * - lots: Array of auction lots with auction details
 * - auction: Auction details object
 * - type: Type of event (update or published)
 *
 * @param {Object} event - Event data
 * @param {Object} context - AWS Lambda context object
 * @param {Object} callback - AWS Lambda callback object
 * @returns {Object} - Object with status and message
 */
module.exports.handler = async (event, context, callback) => {
    try {
        if (connection === null || !connection.readyState) {
            connection = await mongodbHelper.connect()
        }

        const { lots, auction, type } = event

        // The payload is already a JavaScript object, no need for JSON.parse
        const auctionLots = lots
        const auctionDetails = auction
        // Create a Redis client
        const client = await redisHelper.createRedisClient()
        // Calculate the extension time in ms
        const extend_time = parseInt(auctionDetails.extension_time.replace('m', ''), 10) * 60 * 1000

        // If the event type is 'update', update the time of the lots in Redis
        if (type === 'update') {
            const redisUpdate = []
            redisUpdate.push(findAndUpdateTime(auctionLots, client, extend_time))

            // Process all lots in parallel with proper error handling
            const updatePromises = auctionLots.map(async (item) => {
                try {
                    item.lot_end_time = item.end_date + extend_time

                    // Only process lots that haven't ended
                    if (item.end_date > currentTimeEpoch) {
                        // Get execution ARN
                        const getAllArns = await mongodbHelper.singleGetAllExecutionArn(item, StepFunctionArn)

                        if (!getAllArns || !getAllArns.arn) {
                            console.error(`No execution ARN found for lot ${item._id}`)
                            return { success: false, lot_id: item._id, error: 'No ARN found' }
                        }

                        const executionArn = getAllArns.arn

                        // Stop existing execution with retry
                        console.log(`Stopping execution for lot ${item._id}: ${executionArn}`)
                        const stopResult = await stopExecutionWithRetry(executionArn)

                        if (!stopResult || stopResult.status === false) {
                            console.error(`Failed to stop execution for lot ${item._id}`)
                            return { success: false, lot_id: item._id, error: 'Stop failed' }
                        }

                        // Wait a moment before starting new execution
                        await new Promise((resolve) => setTimeout(resolve, 1000))

                        // Start new execution with retry
                        console.log(`Starting new execution for lot ${item._id}`)
                        const startResult = await startExecutionWithRetry(process.env.STATE_MACHINE_LOT_ARN, item)

                        if (!startResult || startResult.status === false) {
                            console.error(`Failed to start execution for lot ${item._id}`)
                            return { success: false, lot_id: item._id, error: 'Start failed' }
                        }

                        return { success: true, lot_id: item._id }
                    }

                    return { success: true, lot_id: item._id, skipped: 'Lot already ended' }
                } catch (error) {
                    console.error(`Error processing lot ${item._id}:`, error)
                    return { success: false, lot_id: item._id, error: error.message }
                }
            })

            // Wait for all operations to complete
            const [redisResults, ...updateResults] = await Promise.all([
                Promise.all(redisUpdate),
                ...updatePromises,
            ])

            // Log results for debugging
            const successful = updateResults.filter((r) => r.success)
            const failed = updateResults.filter((r) => !r.success)

            console.log(`Update completed: ${successful.length} successful, ${failed.length} failed`)
            if (failed.length > 0) {
                console.error('Failed lots:', failed)
            }
        }

        // If the event type is 'published', start new executions for all the lots
        if (type === 'published') {
            console.log('inside published')
            const startExecutions = []
            for (const item of auctionLots) {
                startExecutions.push(startExecutionAfterPublish(process.env.STATE_MACHINE_LOT_ARN, item))
            }
            const results = await Promise.all(startExecutions)
            console.log(`Published: Started ${results.length} executions`)
        }

        return true
    } catch (error) {
        console.error('Handler Error:', error)
        throw error
    }
}
