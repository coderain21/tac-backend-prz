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

// const { startExecution, stopExecutions } = require('../lib/step_function_helper')
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
                    reject(error)
                }
                if (data) {
                    // If there is data, save the execution ARN to the DB and resolve the promise with the data
                    const requestPayload = {
                        arn: data.executionArn,
                        lot_id: lots._id.toString(),
                        auction_id: lots.auction_id,
                        seller_email: lots.seller_email,
                    }
                    await mongodbHelper.save(requestPayload, StepFunctionArn)
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
        // Log that the state machine is being started
        console.log('execution starteddd')
        // Create a new StepFunctions client
        const stepfunctions = new StepFunctions()
        // Convert the start_date to an ISO string
        const newStartDate = new Date(lots.start_date).toISOString()
        // Set the start_date on the lots object to the ISO string
        lots.start_date = newStartDate
        // Set up the parameters for the startExecution call
        const params = {
            stateMachineArn: executionARN,
            // Stringify the lots object and use it as the input to the state machine
            input: JSON.stringify(lots),
        }

        return new Promise((resolve, reject) => {
            // Start the state machine execution
            stepfunctions.startExecution(params, async (error, data) => {
                // If there is an error, reject the promise with that error
                if (error) {
                    reject(error)
                }
                // If there is data, update the MongoDB record with the execution ARN
                if (data) {
                    // Get the execution ARN from MongoDB
                    const getArn = await mongodbHelper.getExecutionArn(lots, StepFunctionArn)
                    // Update the MongoDB record with the execution ARN
                    await mongodbHelper.updateArn(getArn, data, StepFunctionArn)
                    // Resolve the promise with the data
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
 * Stops an execution of the state machine for the given execution ARN.
 *
 * @param {string} executionArn - The ARN of the state machine execution to stop
 * @returns {Promise} A promise that resolves with the data from the stopExecution call if successful,
 * or rejects with an error
 */

async function stopExecutions(executionArn) {
    try {
        // Log that the state machine execution is being stopped
        console.log('INSIDE STOP: ')
        // Create a new StepFunctions client
        const stepFunctions = new StepFunctions()
        // Set up the parameters for the stopExecution call
        const params = {
            executionArn,
            // Set the cause of the stop to 'User initiated stop'
            cause: 'User initiated stop',
        }
        return new Promise((resolve, reject) => {
            // Stop the state machine execution
            stepFunctions.stopExecution(params, async (error, data) => {
                // If there is an error, reject the promise with that error
                if (error) {
                    reject(error)
                }
                // If there is data, resolve the promise with that data
                if (data) {
                    resolve(data)
                }
                // If there is no data, resolve the promise with an object with a status of false
                resolve({ status: false })
            })
        })
    } catch (err) {
        // Log the error to the console
        console.log('errr', err)
    }
}






/*
The function begins by setting the initial end time of the lot based on its end date.
It checks if the Redis client is open and connects if it is not.
It retrieves existing information about the lot from Redis using the lot's ID.
The existing record is parsed, and a new set of information is created for updating, including extending the lot's end date and marking it as extended.
The updated information is then stored back in the Redis database.
Additional data about the lot and the auction extension is prepared.
An extension alert is sent using a custom function (extensionAlert) with information about the extended lot.
A socket event is emitted to join a bid room, and the function returns true on successful execution.
*/

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
            end_date: lotInformation.lot_end_time,
        }
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
        return new Promise((resolve, reject) => {
            const options = {
                method: 'POST',
                url: reqUrl,
                headers: headersList,
                body: JSON.stringify(payload),
            }

            request(options, (error, response) => {
                if (error) {
                    console.error('Error:', error)
                    reject(error)
                } else {
                    resolve(response)
                }
            })
        })
    } catch (err) {
        console.log(err)
    }
}






/**
 * Function to update the time of the lot in redis based on the
 * extension time.
 * @param {Object} auctionLots - Array of auction lots to update in redis
 * @param {Object} client - Redis client object
 * @param {Object} io - Socket.io object
 * @param {Object} socket - Socket.io socket object
 * @param {Object} auctionDetails - Auction details object
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
        const firstRecord = event.Records[0]
        // Get the lots, auction details and type from the event message
        const lotsString = firstRecord.messageAttributes.lots.stringValue
        const auctionString = firstRecord.messageAttributes.auction.stringValue
        const type = firstRecord.messageAttributes.type.stringValue
        const auctionLots = JSON.parse(lotsString)
        const auctionDetails = JSON.parse(auctionString)

        // Create a Redis client
        const client = await redisHelper.createRedisClient()

        // Calculate the extension time in ms
        const extend_time = parseInt(auctionDetails.extension_time.replace('m', ''), 10) * 60 * 1000

        // If the event type is 'update', update the time of the lots in Redis
        if (type === 'update') {
            const redisUpdate = []
            // Find and update the time of the lots in Redis
            redisUpdate.push(findAndUpdateTime(auctionLots, client, extend_time))

            // Get all the execution ARNs for the lots and stop the executions
            const stopExecutionsPromise = []
            const startExecutionsPromise = []
            const mongodbPromise = []
            for (const item of auctionLots) {
                item.lot_end_time = item.end_date + extend_time
                // If the lot end date is greater than the current date
                if (item.end_date > currentTimeEpoch) {
                    // Get the execution ARN from MongoDB
                    const getAllArns = await mongodbHelper.singleGetAllExecutionArn(item, StepFunctionArn)
                    const executionArn = getAllArns.arn
                    // Stop the execution
                    stopExecutionsPromise.push(stopExecutions(executionArn))
                    // Start a new execution
                    startExecutionsPromise.push(startExecution(process.env.STATE_MACHINE_LOT_ARN, item))
                    // Update the end date of the lot in MongoDB
                    mongodbPromise.push(mongodbHelper.updateSignleLot({ lot_id: item._id, end_date: item.lot_end_time }, Lot))
                }
            }
            // Run all the promises in parallel
            await Promise.all([redisUpdate, startExecutionsPromise, stopExecutionsPromise, mongodbPromise])
        }

        // If the event type is 'published', start new executions for all the lots
        if (type === 'published') {
            const startExecutions = []
            for (const item of auctionLots) {
                startExecutions.push(startExecutionAfterPublish(process.env.STATE_MACHINE_LOT_ARN, item))
            }
            await Promise.all(startExecutions)
        }
    } catch (error) {
        console.error('Error:', error)
        // Return an object with status false and error message
        return callback(null, {
            status: false,
            message: 'Authentication Failed',
        })
    }
    // Return an object with status true
    return callback(null, {
        status: true,
    })
}
